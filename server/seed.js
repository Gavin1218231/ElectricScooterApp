require('dotenv').config();

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./database');
const { randomPointInRadius } = require('./utils/geo');

// San Francisco downtown as center
const CENTER_LAT = 37.7749;
const CENTER_LNG = -122.4194;

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
  `).run(id, user.email, bcrypt.hashSync('password123', 10), user.name, user.phone, 25.00);
}

// Create scooters scattered around SF
const scooterModels = ['Vim S1', 'Vim S2', 'Vim Pro', 'Vim Max'];
const scooterStatuses = ['available', 'available', 'available', 'available', 'available', 'available', 'available', 'maintenance', 'low_battery'];
const scooters = [];

for (let i = 1; i <= 50; i++) {
  const id = uuidv4();
  const code = `VIM-${String(i).padStart(4, '0')}`;
  const model = scooterModels[Math.floor(Math.random() * scooterModels.length)];
  const status = scooterStatuses[Math.floor(Math.random() * scooterStatuses.length)];
  const battery = status === 'low_battery' ? Math.floor(Math.random() * 10) + 1 : Math.floor(Math.random() * 60) + 40;
  const { latitude, longitude } = randomPointInRadius(CENTER_LAT, CENTER_LNG, 3000);
  const totalRides = Math.floor(Math.random() * 200);
  const totalDistance = totalRides * (Math.random() * 3000 + 500);

  scooters.push(id);
  db.prepare(`
    INSERT INTO scooters (id, code, model, status, battery_level, latitude, longitude, total_rides, total_distance, price_per_minute)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, code, model, status, battery, latitude, longitude, totalRides, totalDistance, model === 'Vim Pro' ? 0.49 : model === 'Vim Max' ? 0.59 : 0.39);
}

// Create some completed ride history
for (let i = 0; i < 15; i++) {
  const userId = userIds[Math.floor(Math.random() * userIds.length)];
  const scooterId = scooters[Math.floor(Math.random() * scooters.length)];
  const start = randomPointInRadius(CENTER_LAT, CENTER_LNG, 2000);
  const end = randomPointInRadius(start.latitude, start.longitude, 1500);
  const duration = Math.floor(Math.random() * 30) + 3;
  const distance = Math.random() * 4000 + 200;
  const cost = Math.round(duration * 0.39 * 100) / 100;
  const rating = Math.random() > 0.3 ? Math.floor(Math.random() * 2) + 4 : null;

  const rideId = uuidv4();
  db.prepare(`
    INSERT INTO rides (id, user_id, scooter_id, status, start_latitude, start_longitude,
      end_latitude, end_longitude, distance, duration, cost, rating, started_at, ended_at)
    VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' hours'), datetime('now', '-' || ? || ' hours'))
  `).run(rideId, userId, scooterId, start.latitude, start.longitude, end.latitude, end.longitude,
    distance, duration, cost, rating, Math.floor(Math.random() * 168) + 1, Math.floor(Math.random() * 168));

  db.prepare('INSERT INTO payments (id, user_id, ride_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), userId, rideId, -cost, 'ride_charge', `Ride: ${duration} min`);
}

// Create riding zones
const zones = [
  { name: 'Downtown Core', type: 'riding', lat: 37.7749, lng: -122.4194, radius: 3000 },
  { name: 'Golden Gate Park', type: 'slow', lat: 37.7694, lng: -122.4862, radius: 1500, speed_limit: 10 },
  { name: 'Ferry Building', type: 'parking', lat: 37.7955, lng: -122.3937, radius: 200 },
  { name: 'Union Square', type: 'parking', lat: 37.7879, lng: -122.4074, radius: 150 },
  { name: 'Fisherman\'s Wharf', type: 'slow', lat: 37.8080, lng: -122.4177, radius: 500, speed_limit: 8 },
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
