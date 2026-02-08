const express = require('express');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { calculateDistance } = require('../utils/geo');

const router = express.Router();

// Get all available scooters (with optional location filter)
router.get('/', authenticate, (req, res) => {
  try {
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
    const stats = {
      total: scooters.length,
      available: scooters.filter(s => s.status === 'available').length,
      in_use: scooters.filter(s => s.status === 'in_use').length,
      maintenance: scooters.filter(s => s.status === 'maintenance').length,
      low_battery: scooters.filter(s => s.status === 'low_battery' || s.battery_level <= 10).length,
      disabled: scooters.filter(s => s.status === 'disabled').length,
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
