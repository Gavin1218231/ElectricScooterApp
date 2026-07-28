const express = require('express');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { reapAbandonedRides, completeRide } = require('../utils/rideLifecycle');
const { calculateDistance } = require('../utils/geo');

const router = express.Router();

// Get all available scooters (with optional location filter)
router.get('/', authenticate, (req, res) => {
  try {
    // Reclaim scooters stuck in_use by abandoned rides before listing.
    reapAbandonedRides();

    const { lat, lng, radius = 2000 } = req.query;
    let scooters;

    if (lat && lng) {
      // Get all available scooters and filter by distance
      scooters = db.prepare(
        "SELECT * FROM scooters WHERE status = 'available' AND battery_level > 10"
      ).all();

      scooters = scooters
        .map(s => ({
          ...s,
          distance: calculateDistance(parseFloat(lat), parseFloat(lng), s.latitude, s.longitude)
        }))
        .filter(s => s.distance <= parseFloat(radius))
        .sort((a, b) => a.distance - b.distance);
    } else {
      scooters = db.prepare(
        "SELECT * FROM scooters WHERE status = 'available' AND battery_level > 10"
      ).all();
    }

    res.json({ scooters, count: scooters.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scooters' });
  }
});

// Get all scooters (admin)
router.get('/all', authenticate, requireAdmin, (req, res) => {
  try {
    const scooters = db.prepare('SELECT * FROM scooters ORDER BY created_at DESC').all();
    // Counts are keyed strictly on status so the buckets are mutually exclusive
    // and sum to total. needs_charge is reported separately as an overlay.
    const stats = {
      total: scooters.length,
      available: scooters.filter(s => s.status === 'available').length,
      in_use: scooters.filter(s => s.status === 'in_use').length,
      maintenance: scooters.filter(s => s.status === 'maintenance').length,
      low_battery: scooters.filter(s => s.status === 'low_battery').length,
      disabled: scooters.filter(s => s.status === 'disabled').length,
      reserved: scooters.filter(s => s.status === 'reserved').length,
      needs_charge: scooters.filter(s => s.battery_level <= 10).length,
      // Disjoint "needs a human" count: each scooter counted at most once.
      // Computed server-side so the UI can't double-count by summing buckets.
      needs_attention: scooters.filter(s =>
        s.status === 'maintenance' || s.status === 'disabled' ||
        s.status === 'low_battery' || s.battery_level <= 10
      ).length,
    };
    res.json({ scooters, stats });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scooters' });
  }
});

// Get single scooter by ID or code
router.get('/:identifier', authenticate, (req, res) => {
  try {
    const { identifier } = req.params;
    const scooter = db.prepare('SELECT * FROM scooters WHERE id = ? OR code = ?').get(identifier, identifier);

    if (!scooter) {
      return res.status(404).json({ error: 'Scooter not found' });
    }

    res.json({ scooter });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scooter' });
  }
});

// Update scooter (admin)
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const { status, battery_level, latitude, longitude } = req.body;
    const scooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(req.params.id);

    if (!scooter) {
      return res.status(404).json({ error: 'Scooter not found' });
    }

    // Validate up front so bad input is a 400, not a CHECK-constraint 500.
    const VALID_STATUSES = ['available', 'in_use', 'reserved', 'maintenance', 'low_battery', 'disabled'];
    if (status != null && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    if (battery_level != null &&
        (!Number.isInteger(battery_level) || battery_level < 0 || battery_level > 100)) {
      return res.status(400).json({ error: 'Battery level must be a whole number between 0 and 100' });
    }
    if (latitude != null && (typeof latitude !== 'number' || !isFinite(latitude) || latitude < -90 || latitude > 90)) {
      return res.status(400).json({ error: 'Invalid latitude' });
    }
    if (longitude != null && (typeof longitude !== 'number' || !isFinite(longitude) || longitude < -180 || longitude > 180)) {
      return res.status(400).json({ error: 'Invalid longitude' });
    }

    // Don't let a status change out of in_use strand an active ride. Releasing
    // the scooter while someone is riding it allows a second rider to unlock
    // the same scooter, producing two active rides that both bill and fight
    // over its position. Force-end the ride instead of silently freeing it.
    if (status != null && status !== 'in_use' && scooter.status === 'in_use') {
      const activeRide = db.prepare(
        "SELECT * FROM rides WHERE scooter_id = ? AND status = 'active'"
      ).get(req.params.id);

      if (activeRide) {
        if (req.query.force_end !== 'true') {
          return res.status(409).json({
            error: 'Scooter has an active ride. Retry with ?force_end=true to end the ride and change status.',
            ride_id: activeRide.id,
          });
        }
        completeRide(activeRide, { reason: 'ended by admin' });
      }
    }

    db.prepare(`
      UPDATE scooters SET
        status = COALESCE(?, status),
        battery_level = COALESCE(?, battery_level),
        latitude = COALESCE(?, latitude),
        longitude = COALESCE(?, longitude),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      status || null,
      battery_level != null ? battery_level : null,
      latitude != null ? latitude : null,
      longitude != null ? longitude : null,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM scooters WHERE id = ?').get(req.params.id);
    res.json({ scooter: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update scooter' });
  }
});

module.exports = router;
