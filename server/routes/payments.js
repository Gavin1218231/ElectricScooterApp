const express = require('express');
const db = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Get payment history
router.get('/', authenticate, (req, res) => {
  try {
    const payments = db.prepare(`
      SELECT * FROM payments
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);

    const totalSpent = db.prepare(
      "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM payments WHERE user_id = ? AND type = 'ride_charge'"
    ).get(req.user.id).total;

    const totalAdded = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE user_id = ? AND type = 'top_up'"
    ).get(req.user.id).total;

    res.json({
      payments,
      summary: {
        totalSpent: Math.round(totalSpent * 100) / 100,
        totalAdded: Math.round(totalAdded * 100) / 100,
        currentBalance: req.user.balance,
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

module.exports = router;
