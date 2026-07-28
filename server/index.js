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

// Trust the reverse proxy ONLY when explicitly configured. Trusting
// X-Forwarded-For unconditionally lets any client spoof its IP and reset its
// own rate-limit counter, defeating brute-force protection. Left off, Express
// keys on the real socket address, which cannot be forged.
// Set TRUST_PROXY when actually deployed behind a proxy: "1" (hops to trust),
// "loopback", or a specific proxy IP/subnet.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  const hops = Number(trustProxy);
  app.set('trust proxy', Number.isInteger(hops) && hops >= 0 ? hops : trustProxy);
}

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

// JSON error handler for API routes. Without this, a malformed body or an
// oversized payload returns Express's default HTML error page, which the client
// reports to the user as the misleading "Server returned an invalid response".
app.use('/api', (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  console.error('Unhandled API error:', err.message);
  return res.status(500).json({ error: 'Internal server error' });
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
