require('dotenv').config();

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./database');
const { randomPointInRadius } = require('./utils/geo');

// Southwest Florida (Fort Myers) as center
const CENTER_LAT = 26.6406;
const CENTER_LNG = -81.8723;

console.log('Seeding Vim Scooter database...');

// Clear existing data
db.exec('DELETE FROM payments');
db.exec('DELETE FROM rides');
db.exec('DELETE FROM scooters');
db.exec('DELETE FROM users');
db.exec('DELETE FROM zones');

// Create admin user
const adminId = uuidv4();
db.prepare(`
  INSERT INTO users (id, email, password, name, phone, role, balance)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(adminId, 'admin@vim.rides', bcrypt.hashSync('admin123', 10), 'Vim Admin', '+1-555-0100', 'admin', 1000.00);

db.prepare('INSERT INTO payments (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
  .run(uuidv4(), adminId, 1000.00, 'top_up', 'Initial account funding');

// Create demo users
const users = [
  { email: 'rider@vim.rides', name: 'Alex Rider', phone: '+1-555-0101' },
  { email: 'demo@vim.rides', name: 'Demo User', phone: '+1-555-0102' },
];

const userIds = [];
for (const user of users) {
  const id = uuidv4();
  userIds.push(id);
  db.prepare(`
    INSERT INTO users (id, email, password, name, phone, balance)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, user.email, bcrypt.hashSync('password123', 10), user.name, user.phone, 100.00);

  db.prepare('INSERT INTO payments (id, user_id, amount, type, description) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), id, 100.00, 'top_up', 'Initial account funding');
}

// Create scooters scattered across Southwest Florida cities
const scooterModels = ['Vim S1', 'Vim S2', 'Vim Pro', 'Vim Max'];
const scooterStatuses = ['available', 'available', 'available', 'available', 'available', 'available', 'available', 'maintenance', 'low_battery'];
const scooters = [];

// Distribute scooters across multiple SW Florida hubs
const scooterHubs = [
  { name: 'Fort Myers',   lat: 26.6406, lng: -81.8723, count: 18, radius: 2500 },
  { name: 'Naples',       lat: 26.1420, lng: -81.7948, count: 15, radius: 2000 },
  { name: 'Cape Coral',   lat: 26.5629, lng: -81.9495, count: 8,  radius: 2000 },
  { name: 'Punta Gorda',  lat: 26.9298, lng: -82.0454, count: 5,  radius: 1500 },
  { name: 'Fort Myers Beach', lat: 26.4520, lng: -81.9495, count: 4, radius: 1000 },
];

let scooterIndex = 1;
for (const hub of scooterHubs) {
  for (let i = 0; i < hub.count; i++) {
    const id = uuidv4();
    const code = `VIM-${String(scooterIndex).padStart(4, '0')}`;
    const model = scooterModels[Math.floor(Math.random() * scooterModels.length)];
    const status = scooterStatuses[Math.floor(Math.random() * scooterStatuses.length)];
    const battery = status === 'low_battery' ? Math.floor(Math.random() * 10) + 1 : Math.floor(Math.random() * 60) + 40;
    const { latitude, longitude } = randomPointInRadius(hub.lat, hub.lng, hub.radius);
    const totalRides = Math.floor(Math.random() * 200);
    const totalDistance = totalRides * (Math.random() * 3000 + 500);

    scooters.push(id);
    db.prepare(`
      INSERT INTO scooters (id, code, model, status, battery_level, latitude, longitude, total_rides, total_distance, price_per_minute)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, model, status, battery, latitude, longitude, totalRides, totalDistance, model === 'Vim Pro' ? 0.49 : model === 'Vim Max' ? 0.59 : 0.39);
    scooterIndex++;
  }
}

// Create some completed ride history
for (let i = 0; i < 15; i++) {
  const userId = userIds[Math.floor(Math.random() * userIds.length)];
  const scooterId = scooters[Math.floor(Math.random() * scooters.length)];
  const start = randomPointInRadius(CENTER_LAT, CENTER_LNG, 2000);
  const end = randomPointInRadius(start.latitude, start.longitude, 1500);
  const duration = Math.floor(Math.random() * 30) + 3;
  const distance = Math.random() * 4000 + 200;
  const unlockFee = 1.00;
  const cost = Math.round(duration * 0.39 * 100) / 100;
  const rating = Math.random() > 0.3 ? Math.floor(Math.random() * 2) + 4 : null;
  // Derive ended_at from started_at + duration so history is internally
  // consistent (previously both offsets were random and could invert).
  const startedHoursAgo = Math.floor(Math.random() * 168) + 1;

  const rideId = uuidv4();
  db.prepare(`
    INSERT INTO rides (id, user_id, scooter_id, status, start_latitude, start_longitude,
      end_latitude, end_longitude, distance, duration, cost, unlock_fee, rating, started_at, ended_at)
    VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?,
      datetime('now', '-' || ? || ' hours'),
      datetime('now', '-' || ? || ' hours', '+' || ? || ' minutes'))
  `).run(rideId, userId, scooterId, start.latitude, start.longitude, end.latitude, end.longitude,
    distance, duration, cost, unlockFee, rating, startedHoursAgo, startedHoursAgo, duration);

  // Mirror the live flow, which records the unlock fee and the ride cost as
  // separate ride_charge rows, so revenue reporting matches real rides.
  db.prepare('INSERT INTO payments (id, user_id, ride_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), userId, rideId, -unlockFee, 'ride_charge', 'Unlock fee');
  db.prepare('INSERT INTO payments (id, user_id, ride_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), userId, rideId, -cost, 'ride_charge', `Ride: ${duration} min`);
}

// Derive every balance from the payment ledger. Previously seeded rides wrote
// ride_charge rows without debiting the user, so the wallet showed a balance
// that was arithmetically impossible given its own transaction list.
db.prepare(`
  UPDATE users SET balance = (
    SELECT ROUND(COALESCE(SUM(amount), 0), 2) FROM payments WHERE payments.user_id = users.id
  )
`).run();

// Create riding zones across Southwest Florida
const zones = [
  { name: 'Downtown Fort Myers', type: 'riding', lat: 26.6406, lng: -81.8723, radius: 3000 },
  { name: 'Naples 5th Avenue', type: 'riding', lat: 26.1420, lng: -81.7948, radius: 2500 },
  { name: 'Punta Gorda Fishermen\'s Village', type: 'parking', lat: 26.9298, lng: -82.0454, radius: 300 },
  { name: 'Fort Myers Beach', type: 'slow', lat: 26.4520, lng: -81.9495, radius: 1500, speed_limit: 10 },
  { name: 'Cape Coral Parkway', type: 'riding', lat: 26.5629, lng: -81.9495, radius: 2000 },
  { name: 'Sanibel Island Causeway', type: 'slow', lat: 26.4900, lng: -82.0210, radius: 800, speed_limit: 8 },
  { name: 'Naples Pier', type: 'parking', lat: 26.1312, lng: -81.8076, radius: 200 },
  { name: 'Centennial Park Fort Myers', type: 'parking', lat: 26.6486, lng: -81.8705, radius: 250 },
];

for (const zone of zones) {
  db.prepare(`
    INSERT INTO zones (id, name, type, center_lat, center_lng, radius, speed_limit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), zone.name, zone.type, zone.lat, zone.lng, zone.radius, zone.speed_limit || null);
}

console.log('Database seeded successfully!');
console.log(`  - 1 admin user (admin@vim.rides / admin123)`);
console.log(`  - ${users.length} demo users (rider@vim.rides / password123)`);
console.log(`  - 50 scooters`);
console.log(`  - 15 ride history records`);
console.log(`  - ${zones.length} zones`);
