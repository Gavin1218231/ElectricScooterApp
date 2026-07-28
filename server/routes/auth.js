const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanEmail || !password || !cleanName) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }

    // Basic RFC-ish shape check: local@domain.tld, no whitespace.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (cleanName.length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or fewer' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password.length > 200) {
      return res.status(400).json({ error: 'Password must be 200 characters or fewer' });
    }

    if (phone != null && (typeof phone !== 'string' || phone.trim().length > 30)) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);

    db.prepare(
      'INSERT INTO users (id, email, password, name, phone) VALUES (?, ?, ?, ?, ?)'
    ).run(id, cleanEmail, hashedPassword, cleanName, phone ? phone.trim() : null);

    const user = db.prepare('SELECT id, email, name, phone, role, balance, created_at FROM users WHERE id = ?').get(id);
    const token = generateToken(user);

    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { password: _, ...userWithoutPassword } = user;
    const token = generateToken(user);

    res.json({ user: userWithoutPassword, token });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user profile
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Update profile
router.put('/me', authenticate, (req, res) => {
  try {
    const { name, phone } = req.body;

    // Distinguish "absent" (leave unchanged) from "empty string" (clear it).
    // Using `phone || null` with COALESCE made clearing a phone impossible:
    // '' became null, which COALESCE read as "keep the old value".
    const nameProvided = Object.prototype.hasOwnProperty.call(req.body, 'name');
    const phoneProvided = Object.prototype.hasOwnProperty.call(req.body, 'phone');

    let nextName;
    if (nameProvided) {
      if (typeof name !== 'string') {
        return res.status(400).json({ error: 'Name must be text' });
      }
      nextName = name.trim();
      if (!nextName) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      if (nextName.length > 100) {
        return res.status(400).json({ error: 'Name must be 100 characters or fewer' });
      }
    }

    let nextPhone;
    if (phoneProvided) {
      if (phone !== null && typeof phone !== 'string') {
        return res.status(400).json({ error: 'Phone must be text' });
      }
      nextPhone = phone === null ? null : phone.trim();
      if (nextPhone && nextPhone.length > 30) {
        return res.status(400).json({ error: 'Phone must be 30 characters or fewer' });
      }
      if (nextPhone === '') nextPhone = null;
    }

    db.prepare(`
      UPDATE users SET
        name = CASE WHEN ? THEN ? ELSE name END,
        phone = CASE WHEN ? THEN ? ELSE phone END,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nameProvided ? 1 : 0, nameProvided ? nextName : null,
      phoneProvided ? 1 : 0, phoneProvided ? nextPhone : null,
      req.user.id
    );

    const user = db.prepare('SELECT id, email, name, phone, role, balance, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Add balance (simulated payment)
router.post('/top-up', authenticate, (req, res) => {
  try {
    const { amount } = req.body;
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0 || amount > 100) {
      return res.status(400).json({ error: 'Amount must be between $0.01 and $100.00' });
    }
    // Reject sub-cent precision: crediting 10.555 while the ledger records
    // "$10.56" permanently desyncs the balance from the transaction history.
    if (Math.round(amount * 100) !== Number((amount * 100).toFixed(6))) {
      return res.status(400).json({ error: 'Amount cannot include fractions of a cent' });
    }

    // NOTE: top-ups are simulated (no real payment processor). As a guardrail
    // against unlimited free balance, cap the total credited per user per day.
    // A production deployment must credit balance only on confirmed payment capture.
    const DAILY_TOPUP_LIMIT = 200;

    const topUp = db.transaction(() => {
      const todayTotal = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE user_id = ? AND type = 'top_up' AND created_at >= date('now')"
      ).get(req.user.id).total;

      if (todayTotal + amount > DAILY_TOPUP_LIMIT) {
        const err = new Error(`Daily top-up limit of $${DAILY_TOPUP_LIMIT.toFixed(2)} reached`);
        err.statusCode = 429;
        throw err;
      }

      db.prepare('UPDATE users SET balance = balance + ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(amount, req.user.id);

      const paymentId = uuidv4();
      db.prepare('INSERT INTO payments (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
        .run(paymentId, req.user.id, amount, 'top_up', `Added $${amount.toFixed(2)} to wallet`);
    });
    topUp();

    const user = db.prepare('SELECT id, email, name, phone, role, balance, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json({ user, message: `$${amount.toFixed(2)} added to your wallet` });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: 'Top-up failed' });
  }
});

module.exports = router;
