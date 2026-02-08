# Vim - Electric Scooter Rental App

Rent, ride, and return electric scooters. A full-stack scooter-sharing platform built with React and Node.js.

## Features

- **Interactive Map** - Find nearby scooters on a real-time Leaflet map with battery levels and pricing
- **Unlock & Ride** - Start rides instantly with one tap, track duration and cost in real-time
- **Smart Pricing** - Per-minute billing with unlock fees, varies by scooter model (S1, S2, Pro, Max)
- **Digital Wallet** - Top up balance, view transaction history, track spending
- **Ride History** - Full history of past rides with distance, duration, cost, and ratings
- **Rate Your Ride** - 5-star rating system after completing rides
- **User Profiles** - Account management with editable profiles
- **Admin Dashboard** - Fleet management, user oversight, revenue tracking, ride monitoring
- **Fleet Management** - Add/edit/disable scooters, monitor battery levels, track maintenance

## Tech Stack

- **Frontend**: React 18, React Router, React Leaflet, OpenStreetMap
- **Backend**: Node.js, Express
- **Database**: SQLite (via better-sqlite3)
- **Auth**: JWT tokens, bcrypt password hashing
- **Maps**: Leaflet with OpenStreetMap tiles

## Quick Start

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Seed the database with demo data (50 scooters in San Francisco)
npm run seed

# Start the development server (API + React)
npm run dev
```

The API runs on `http://localhost:3001` and the React app on `http://localhost:3000`.

For production, run `npm run build` then `npm start` to serve everything from port 3001.

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| rider@vim.rides | password123 | User |
| demo@vim.rides | password123 | User |
| admin@vim.rides | admin123 | Admin |

## API Endpoints

### Auth
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get profile
- `PUT /api/auth/me` - Update profile
- `POST /api/auth/top-up` - Add wallet funds

### Scooters
- `GET /api/scooters` - List available scooters (with location filter)
- `GET /api/scooters/:id` - Get scooter details

### Rides
- `POST /api/rides/start` - Unlock scooter & start ride
- `PUT /api/rides/:id/location` - Update location during ride
- `POST /api/rides/:id/end` - End ride & lock scooter
- `POST /api/rides/:id/rate` - Rate completed ride
- `GET /api/rides` - Ride history
- `GET /api/rides/active` - Current active ride

### Payments
- `GET /api/payments` - Transaction history

### Admin
- `GET /api/admin/dashboard` - Fleet stats & analytics
- `POST /api/admin/scooters` - Add new scooter
- `GET /api/admin/users` - All users
- `GET /api/admin/rides` - All rides

## Scooter Models & Pricing

| Model | Unlock Fee | Per Minute |
|-------|-----------|------------|
| Vim S1 | $1.00 | $0.39 |
| Vim S2 | $1.00 | $0.39 |
| Vim Pro | $1.00 | $0.49 |
| Vim Max | $1.00 | $0.59 |
