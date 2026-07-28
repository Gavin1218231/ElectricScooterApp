const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Dashboard stats
router.get('/dashboard', authenticate, requireAdmin, (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalScooters = db.prepare('SELECT COUNT(*) as count FROM scooters').get().count;
    const totalRides = db.prepare('SELECT COUNT(*) as count FROM rides').get().count;
    const activeRides = db.prepare("SELECT COUNT(*) as count FROM rides WHERE status = 'active'").get().count;
    const totalRevenue = db.prepare("SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM payments WHERE type = 'ride_charge'").get().total;
    const avgRating = db.prepare("SELECT COALESCE(AVG(rating), 0) as avg FROM rides WHERE rating IS NOT NULL").get().avg;

    const scootersByStatus = db.prepare(`
      SELECT status, COUNT(*) as count FROM scooters GROUP BY status
    `).all();

    const recentRides = db.prepare(`
      SELECT r.*, u.name as user_name, s.code as scooter_code
      FROM rides r
      JOIN users u ON r.user_id = u.id
      JOIN scooters s ON r.scooter_id = s.id
      ORDER BY r.started_at DESC, r.id
      LIMIT 10
    `).all();

    const topRiders = db.prepare(`
      SELECT u.name, u.email, COUNT(r.id) as ride_count,
             COALESCE(SUM(r.cost + r.unlock_fee), 0) as total_spent
      FROM users u
      LEFT JOIN rides r ON u.id = r.user_id AND r.status = 'completed'
      GROUP BY u.id
      ORDER BY ride_count DESC
      LIMIT 5
    `).all();

    res.json({
      stats: {
        totalUsers,
        totalScooters,
        totalRides,
        activeRides,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        avgRating: Math.round(avgRating * 10) / 10,
      },
      scootersByStatus,
      recentRides,
      topRiders,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// Add a new scooter
router.post('/scooters', authenticate, requireAdmin, (req, res) => {
  try {
    const { code, model, latitude, longitude, price_per_minute, unlock_fee } = req.body;

    if (!code || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Code, latitude, and longitude are required' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Invalid latitude or longitude' });
    }

    const rate = price_per_minute != null ? Number(price_per_minute) : 0.39;
    const fee = unlock_fee != null ? Number(unlock_fee) : 1.00;
    if (!isFinite(rate) || rate < 0 || !isFinite(fee) || fee < 0) {
      return res.status(400).json({ error: 'Price per minute and unlock fee must be non-negative numbers' });
    }

    const existing = db.prepare('SELECT id FROM scooters WHERE code = ?').get(code);
    if (existing) {
      return res.status(409).json({ error: 'Scooter code already exists' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO scooters (id, code, model, latitude, longitude, price_per_minute, unlock_fee)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, model || 'Vim S1', lat, lng, rate, fee);

    const scooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id);
    res.status(201).json({ scooter });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add scooter' });
  }
});

// Get all users (admin)
router.get('/users', authenticate, requireAdmin, (req, res) => {
  try {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > 200) limit = 200;
    const offset = (page - 1) * limit;

    const users = db.prepare(
      'SELECT id, email, name, phone, role, balance, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    res.json({ users, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get all rides (admin)
router.get('/rides', authenticate, requireAdmin, (req, res) => {
  try {
    const rides = db.prepare(`
      SELECT r.*, u.name as user_name, u.email as user_email, s.code as scooter_code
      FROM rides r
      JOIN users u ON r.user_id = u.id
      JOIN scooters s ON r.scooter_id = s.id
      ORDER BY r.started_at DESC, r.id
      LIMIT 100
    `).all();
    res.json({ rides });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rides' });
  }
});

module.exports = router;
