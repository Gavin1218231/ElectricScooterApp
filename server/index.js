require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const scooterRoutes = require('./routes/scooters');
const rideRoutes = require('./routes/rides');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the reverse proxy (needed for correct client IPs behind a proxy so
// rate limiting keys on the real client, not the proxy).
app.set('trust proxy', 1);

// Security headers. CSP is left to the deployment layer because the served SPA
// uses inline styles and loads OpenStreetMap tiles cross-origin; the remaining
// Helmet defaults (X-Content-Type-Options, frameguard, HSTS, etc.) are safe here.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: restrict to configured origins in production; allow all by default for
// local/dev. Set CORS_ORIGIN to a comma-separated allowlist to lock it down.
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : '*';
app.use(cors({ origin: corsOrigins }));

app.use(express.json({ limit: '16kb' }));

// Rate limiting. A broad limiter protects the whole API; a stricter one guards
// the auth endpoints against brute force / credential stuffing. Successful
// requests are not counted against the auth limiter, so only failed attempts
// (bad passwords, duplicate registrations) accrue toward the limit.
const disableRateLimit = process.env.DISABLE_RATE_LIMIT === 'true';

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

if (!disableRateLimit) {
  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/scooters', scooterRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Vim Scooter API', timestamp: new Date().toISOString() });
});

// 404 handler for unknown API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Serve React app in production
const clientBuild = path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuild));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuild, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`⚡ Vim Scooter API running on port ${PORT}`);
});

module.exports = app;
