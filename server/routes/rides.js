const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { calculateDistance } = require('../utils/geo');

const router = express.Router();

// Start a ride (unlock scooter)
router.post('/start', authenticate, (req, res) => {
  try {
    const { scooter_id, latitude, longitude } = req.body;

    if (!scooter_id || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Scooter ID and location are required' });
    }

    // Check user doesn't have an active ride
    const activeRide = db.prepare(
      "SELECT id FROM rides WHERE user_id = ? AND status = 'active'"
    ).get(req.user.id);
    if (activeRide) {
      return res.status(400).json({ error: 'You already have an active ride', ride_id: activeRide.id });
    }

    // Check user balance
    if (req.user.balance < 1.00) {
      return res.status(400).json({ error: 'Insufficient balance. Please top up your wallet.' });
    }

    // Check scooter is available
    const scooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(scooter_id);
    if (!scooter) {
      return res.status(404).json({ error: 'Scooter not found' });
    }
    if (scooter.status !== 'available') {
      return res.status(400).json({ error: 'Scooter is not available' });
    }
    if (scooter.battery_level <= 10) {
      return res.status(400).json({ error: 'Scooter battery is too low' });
    }

    const rideId = uuidv4();

    const startRide = db.transaction(() => {
      // Create ride
      db.prepare(`
        INSERT INTO rides (id, user_id, scooter_id, start_latitude, start_longitude, unlock_fee, per_minute_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(rideId, req.user.id, scooter_id, latitude, longitude, scooter.unlock_fee, scooter.price_per_minute);

      // Mark scooter as in use
      db.prepare("UPDATE scooters SET status = 'in_use', updated_at = datetime('now') WHERE id = ?")
        .run(scooter_id);

      // Charge unlock fee
      db.prepare("UPDATE users SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?")
        .run(scooter.unlock_fee, req.user.id);

      // Record unlock fee payment
      db.prepare('INSERT INTO payments (id, user_id, ride_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), req.user.id, rideId, -scooter.unlock_fee, 'ride_charge', 'Unlock fee');
    });

    startRide();

    const ride = db.prepare('SELECT * FROM rides WHERE id = ?').get(rideId);
    const updatedUser = db.prepare('SELECT id, email, name, phone, role, balance FROM users WHERE id = ?').get(req.user.id);

    res.status(201).json({
      ride,
      scooter: { ...scooter, status: 'in_use' },
      user: updatedUser,
      message: `Scooter ${scooter.code} unlocked! Ride started.`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start ride' });
  }
});

// Update ride location (during ride)
router.put('/:id/location', authenticate, (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const ride = db.prepare(
      "SELECT * FROM rides WHERE id = ? AND user_id = ? AND status = 'active'"
    ).get(req.params.id, req.user.id);

    if (!ride) {
      return res.status(404).json({ error: 'Active ride not found' });
    }

    // Update scooter position
    db.prepare('UPDATE scooters SET latitude = ?, longitude = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(latitude, longitude, ride.scooter_id);

    // Calculate distance traveled
    const scooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(ride.scooter_id);
    const totalDistance = calculateDistance(
      ride.start_latitude, ride.start_longitude,
      latitude, longitude
    );

    // Calculate elapsed time in minutes
    const startTime = new Date(ride.started_at + 'Z').getTime();
    const now = Date.now();
    const durationMinutes = Math.floor((now - startTime) / 60000);

    // Calculate running cost
    const rideCost = ride.unlock_fee + (durationMinutes * ride.per_minute_rate);

    // Simulate battery drain (~1% per 500m)
    const batteryDrain = Math.min(Math.floor(totalDistance / 500), scooter.battery_level - 1);
    if (batteryDrain > 0) {
      db.prepare('UPDATE scooters SET battery_level = battery_level - ? WHERE id = ?')
        .run(batteryDrain, ride.scooter_id);
    }

    res.json({
      ride: {
        ...ride,
        distance: totalDistance,
        duration: durationMinutes,
        current_cost: Math.round(rideCost * 100) / 100,
      },
      scooter: { ...scooter, latitude, longitude },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// End a ride (lock scooter)
router.post('/:id/end', authenticate, (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    const ride = db.prepare(
      "SELECT * FROM rides WHERE id = ? AND user_id = ? AND status = 'active'"
    ).get(req.params.id, req.user.id);

    if (!ride) {
      return res.status(404).json({ error: 'Active ride not found' });
    }

    const startTime = new Date(ride.started_at + 'Z').getTime();
    const endTime = Date.now();
    const durationMinutes = Math.max(1, Math.ceil((endTime - startTime) / 60000));

    const endLat = latitude || ride.start_latitude;
    const endLng = longitude || ride.start_longitude;

    const distance = calculateDistance(
      ride.start_latitude, ride.start_longitude,
      endLat, endLng
    );

    const rideCost = durationMinutes * ride.per_minute_rate;
    const totalCost = Math.round(rideCost * 100) / 100;

    const endRide = db.transaction(() => {
      // Complete the ride
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

      // Park the scooter
      const scooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(ride.scooter_id);
      const newBattery = Math.max(0, scooter.battery_level - Math.floor(distance / 500));
      const newStatus = newBattery <= 10 ? 'low_battery' : 'available';

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

      // Charge the user
      db.prepare("UPDATE users SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?")
        .run(totalCost, req.user.id);

      // Record payment
      db.prepare('INSERT INTO payments (id, user_id, ride_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), req.user.id, ride.id, -totalCost, 'ride_charge',
          `Ride charge: ${durationMinutes} min, ${(distance / 1000).toFixed(2)} km`);
    });

    endRide();

    const completedRide = db.prepare('SELECT * FROM rides WHERE id = ?').get(ride.id);
    const updatedUser = db.prepare('SELECT id, email, name, phone, role, balance FROM users WHERE id = ?').get(req.user.id);

    res.json({
      ride: completedRide,
      user: updatedUser,
      summary: {
        duration: durationMinutes,
        distance: Math.round(distance),
        unlock_fee: ride.unlock_fee,
        ride_cost: totalCost,
        total_charged: Math.round((ride.unlock_fee + totalCost) * 100) / 100,
      },
      message: 'Ride completed! Scooter locked.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to end ride' });
  }
});

// Rate a ride
router.post('/:id/rate', authenticate, (req, res) => {
  try {
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const ride = db.prepare(
      "SELECT * FROM rides WHERE id = ? AND user_id = ? AND status = 'completed'"
    ).get(req.params.id, req.user.id);

    if (!ride) {
      return res.status(404).json({ error: 'Completed ride not found' });
    }

    db.prepare('UPDATE rides SET rating = ? WHERE id = ?').run(rating, ride.id);

    res.json({ message: 'Thanks for your rating!', rating });
  } catch (err) {
    res.status(500).json({ error: 'Failed to rate ride' });
  }
});

// Get ride history
router.get('/', authenticate, (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const rides = db.prepare(`
      SELECT r.*, s.code as scooter_code, s.model as scooter_model
      FROM rides r
      JOIN scooters s ON r.scooter_id = s.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM rides WHERE user_id = ?').get(req.user.id).count;

    res.json({ rides, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rides' });
  }
});

// Get current active ride
router.get('/active', authenticate, (req, res) => {
  try {
    const ride = db.prepare(`
      SELECT r.*, s.code as scooter_code, s.model as scooter_model,
             s.battery_level, s.latitude as current_lat, s.longitude as current_lng
      FROM rides r
      JOIN scooters s ON r.scooter_id = s.id
      WHERE r.user_id = ? AND r.status = 'active'
    `).get(req.user.id);

    if (!ride) {
      return res.json({ ride: null });
    }

    // Calculate running stats
    const startTime = new Date(ride.started_at + 'Z').getTime();
    const durationMinutes = Math.floor((Date.now() - startTime) / 60000);
    const currentCost = ride.unlock_fee + (durationMinutes * ride.per_minute_rate);

    res.json({
      ride: {
        ...ride,
        duration: durationMinutes,
        current_cost: Math.round(currentCost * 100) / 100,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active ride' });
  }
});

module.exports = router;
