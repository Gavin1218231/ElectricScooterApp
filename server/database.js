const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'vim_scooters.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    balance REAL DEFAULT 20.00,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scooters (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    model TEXT NOT NULL DEFAULT 'Vim S1',
    status TEXT DEFAULT 'available' CHECK(status IN ('available', 'in_use', 'reserved', 'maintenance', 'low_battery', 'disabled')),
    battery_level INTEGER DEFAULT 100 CHECK(battery_level BETWEEN 0 AND 100),
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    last_maintenance TEXT DEFAULT (datetime('now')),
    total_rides INTEGER DEFAULT 0,
    total_distance REAL DEFAULT 0,
    price_per_minute REAL DEFAULT 0.39,
    unlock_fee REAL DEFAULT 1.00,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    scooter_id TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'cancelled')),
    start_latitude REAL NOT NULL,
    start_longitude REAL NOT NULL,
    end_latitude REAL,
    end_longitude REAL,
    distance REAL DEFAULT 0,
    duration INTEGER DEFAULT 0,
    cost REAL DEFAULT 0,
    unlock_fee REAL DEFAULT 1.00,
    per_minute_rate REAL DEFAULT 0.39,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT,
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (scooter_id) REFERENCES scooters(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ride_id TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('ride_charge', 'top_up', 'refund', 'promo')),
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (ride_id) REFERENCES rides(id)
  );

  CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('riding', 'parking', 'no_ride', 'slow')),
    center_lat REAL NOT NULL,
    center_lng REAL NOT NULL,
    radius REAL NOT NULL DEFAULT 500,
    speed_limit REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_scooters_status ON scooters(status);
  CREATE INDEX IF NOT EXISTS idx_scooters_location ON scooters(latitude, longitude);
  CREATE INDEX IF NOT EXISTS idx_rides_user ON rides(user_id);
  CREATE INDEX IF NOT EXISTS idx_rides_scooter ON rides(scooter_id);
  CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
`);

module.exports = db;
