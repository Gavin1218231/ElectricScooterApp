const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { calculateDistance } = require('./geo');

// Billable time is capped so a ride left open (app closed, dead phone) can't
// bill unbounded. The reaper below uses the same constant as its threshold.
const MAX_BILLABLE_MINUTES = 24 * 60;

function parseSqliteUtc(value) {
  return new Date(String(value).replace(' ', 'T') + 'Z').getTime();
}

// Completes an active ride: bills the rider, parks the scooter, records the
// payment. Shared by the rider-facing end endpoint, the abandoned-ride reaper,
// and admin force-end so all three bill identically. Caller must have verified
// the ride is active.
function completeRide(ride, { latitude, longitude, reason } = {}) {
  const startTime = parseSqliteUtc(ride.started_at);
  const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - startTime) / 60000));
  const durationMinutes = Math.min(elapsedMinutes, MAX_BILLABLE_MINUTES);

  const endLat = latitude != null ? latitude : ride.start_latitude;
  const endLng = longitude != null ? longitude : ride.start_longitude;

  const distance = calculateDistance(
    ride.start_latitude, ride.start_longitude,
    endLat, endLng
  );

  const totalCost = Math.round(durationMinutes * ride.per_minute_rate * 100) / 100;

  db.transaction(() => {
    db.prepare(`
      UPDATE rides SET
        status = 'completed',
        end_latitude = ?,
        end_longitude = ?,
        distance = ?,
        duration = ?,
        cost = ?,
        ended_at = datetime('now')
      WHERE id = ?
    `).run(endLat, endLng, distance, durationMinutes, totalCost, ride.id);

    const scooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(ride.scooter_id);
    const newBattery = Math.max(0, scooter.battery_level - Math.floor(distance / 500));
    // Preserve an admin-set hold (maintenance/disabled) applied mid-ride —
    // otherwise ending the ride silently returns a flagged scooter to the fleet.
    const adminHeld = scooter.status === 'maintenance' || scooter.status === 'disabled';
    const newStatus = adminHeld
      ? scooter.status
      : (newBattery <= 10 ? 'low_battery' : 'available');

    db.prepare(`
      UPDATE scooters SET
        status = ?,
        latitude = ?,
        longitude = ?,
        battery_level = ?,
        total_rides = total_rides + 1,
        total_distance = total_distance + ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, endLat, endLng, newBattery, distance, ride.scooter_id);

    db.prepare("UPDATE users SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?")
      .run(totalCost, ride.user_id);

    const suffix = reason ? ` (${reason})` : '';
    db.prepare('INSERT INTO payments (id, user_id, ride_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), ride.user_id, ride.id, -totalCost, 'ride_charge',
        `Ride charge: ${durationMinutes} min, ${(distance / 1000).toFixed(2)} km${suffix}`);
  })();

  return {
    duration: durationMinutes,
    distance: Math.round(distance),
    unlock_fee: ride.unlock_fee,
    ride_cost: totalCost,
    total_charged: Math.round((totalCost + ride.unlock_fee) * 100) / 100,
  };
}

// Force-completes rides that exceeded the billable cap and were never ended.
// Without this an abandoned ride stays 'active' forever: the scooter is stuck
// in_use (invisible to riders, unrecoverable without DB surgery) and the
// operator never bills the time. Called lazily from read paths, so no cron is
// required. Returns the number of rides reaped.
function reapAbandonedRides() {
  const stale = db.prepare(`
    SELECT * FROM rides
    WHERE status = 'active'
      AND started_at <= datetime('now', '-' || ? || ' minutes')
  `).all(MAX_BILLABLE_MINUTES);

  let reaped = 0;
  for (const ride of stale) {
    try {
      completeRide(ride, { reason: 'auto-ended: exceeded maximum ride time' });
      reaped++;
    } catch (err) {
      // Keep going; one bad row shouldn't block the rest of the sweep.
    }
  }
  return reaped;
}

module.exports = { completeRide, reapAbandonedRides, MAX_BILLABLE_MINUTES };
