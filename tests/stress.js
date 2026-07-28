#!/usr/bin/env node
/**
 * Vim Scooter App - Stress Test Suite
 * Tests: concurrency, race conditions, performance, error handling under load
 */

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const CONCURRENCY = 20;

// ─── Helpers ──────────────────────────────────────────────────

async function req(endpoint, options = {}) {
  const start = Date.now();
  const { headers: optHeaders, ...rest } = options;
  const res = await fetch(`${BASE}/api${endpoint}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...optHeaders },
  });
  const latency = Date.now() - start;
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, latency, ok: res.ok };
}

async function authReq(token, endpoint, options = {}) {
  return req(endpoint, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
}

function stats(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    avg: Math.round(sum / sorted.length),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

function printStats(label, latencies, errors = 0) {
  const s = stats(latencies);
  console.log(`  ${label}: ${s.count} requests | avg=${s.avg}ms p50=${s.p50}ms p95=${s.p95}ms p99=${s.p99}ms max=${s.max}ms | errors: ${errors}`);
}

const results = { passed: 0, failed: 0, warnings: [] };

function pass(name) { results.passed++; console.log(`  ✓ ${name}`); }
function fail(name, detail) { results.failed++; console.log(`  ✗ ${name}: ${detail}`); }
function warn(msg) { results.warnings.push(msg); }

// ─── Test 1: Auth Concurrency ─────────────────────────────────

async function testAuthConcurrency() {
  console.log('\n━━━ TEST 1: Auth Concurrency ━━━');
  console.log(`  Registering ${CONCURRENCY} users concurrently...`);

  const regPromises = Array.from({ length: CONCURRENCY }, (_, i) =>
    req('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `stress${i}@test.com`,
        password: 'password123',
        name: `Stress User ${i}`,
      }),
    })
  );

  const regResults = await Promise.all(regPromises);
  const regSuccess = regResults.filter(r => r.ok);
  const regErrors = regResults.filter(r => !r.ok);
  const regLatencies = regResults.map(r => r.latency);

  printStats('Registration', regLatencies, regErrors.length);

  if (regSuccess.length === CONCURRENCY) {
    pass(`All ${CONCURRENCY} registrations succeeded`);
  } else {
    fail(`Registration`, `${regErrors.length}/${CONCURRENCY} failed`);
  }

  // Concurrent logins
  console.log(`  Logging in ${CONCURRENCY} users concurrently...`);
  const loginPromises = Array.from({ length: CONCURRENCY }, (_, i) =>
    req('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: `stress${i}@test.com`, password: 'password123' }),
    })
  );

  const loginResults = await Promise.all(loginPromises);
  const loginSuccess = loginResults.filter(r => r.ok);
  const loginLatencies = loginResults.map(r => r.latency);

  printStats('Login', loginLatencies, loginResults.length - loginSuccess.length);

  if (loginSuccess.length === CONCURRENCY) {
    pass(`All ${CONCURRENCY} logins succeeded`);
  } else {
    fail('Login', `${CONCURRENCY - loginSuccess.length} failed`);
  }

  // Duplicate registration attempt
  console.log('  Testing duplicate registration detection under concurrency...');
  const dupePromises = Array.from({ length: 5 }, () =>
    req('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'stress0@test.com', password: 'password123', name: 'Dupe' }),
    })
  );
  const dupeResults = await Promise.all(dupePromises);
  const dupeAllRejected = dupeResults.every(r => !r.ok);
  if (dupeAllRejected) {
    pass('All duplicate registrations correctly rejected');
  } else {
    fail('Duplicate registration', 'Some duplicates were accepted');
  }

  return loginSuccess.map(r => r.data.token);
}

// ─── Test 2: Ride Lifecycle Stress ─────────────────────────────

async function testRideLifecycle(tokens) {
  console.log('\n━━━ TEST 2: Ride Lifecycle Stress ━━━');

  // First, top up all users so they can afford rides
  console.log(`  Topping up ${tokens.length} users...`);
  await Promise.all(tokens.map(t =>
    authReq(t, '/auth/top-up', { method: 'POST', body: JSON.stringify({ amount: 50 }) })
  ));

  // Get available scooters
  const { data: scooterData } = await authReq(tokens[0], '/scooters');
  const availableScooters = scooterData.scooters.filter(s => s.status === 'available');
  console.log(`  Available scooters: ${availableScooters.length}`);

  // Start rides concurrently (each user grabs a different scooter)
  const rideCount = Math.min(tokens.length, availableScooters.length);
  console.log(`  Starting ${rideCount} rides concurrently...`);

  const startPromises = Array.from({ length: rideCount }, (_, i) =>
    authReq(tokens[i], '/rides/start', {
      method: 'POST',
      body: JSON.stringify({
        scooter_id: availableScooters[i].id,
        latitude: 26.6406 + (Math.random() * 0.01),
        longitude: -81.8723 + (Math.random() * 0.01),
      }),
    })
  );

  const startResults = await Promise.all(startPromises);
  const startSuccess = startResults.filter(r => r.ok);
  const startLatencies = startResults.map(r => r.latency);

  printStats('Start ride', startLatencies, rideCount - startSuccess.length);

  if (startSuccess.length === rideCount) {
    pass(`All ${rideCount} rides started successfully`);
  } else {
    fail('Start ride', `${rideCount - startSuccess.length} failed`);
    startResults.filter(r => !r.ok).forEach(r => console.log(`    Error: ${r.data?.error}`));
  }

  // Location updates burst.
  // Pair each ride with the token that actually started it. Indexing tokens by
  // position in `startSuccess` silently misaligns them if any start failed,
  // sending later calls with the wrong user's token and reporting a cascade of
  // 404s as location/end failures.
  const started = startResults
    .map((r, i) => ({ r, token: tokens[i] }))
    .filter(({ r }) => r.ok && r.data && r.data.ride);
  const rideIds = started.map(({ r }) => r.data.ride.id);
  const rideTokens = started.map(({ token }) => token);
  console.log(`  Sending 5 location updates per ride (${rideIds.length * 5} total)...`);

  const locPromises = [];
  for (let burst = 0; burst < 5; burst++) {
    for (let i = 0; i < rideIds.length; i++) {
      locPromises.push(
        authReq(rideTokens[i], `/rides/${rideIds[i]}/location`, {
          method: 'PUT',
          body: JSON.stringify({
            latitude: 26.6406 + (burst * 0.001),
            longitude: -81.8723 + (burst * 0.001),
          }),
        })
      );
    }
  }

  const locResults = await Promise.all(locPromises);
  const locSuccess = locResults.filter(r => r.ok);
  const locLatencies = locResults.map(r => r.latency);

  printStats('Location update', locLatencies, locResults.length - locSuccess.length);

  if (locSuccess.length === locPromises.length) {
    pass(`All ${locPromises.length} location updates succeeded`);
  } else {
    fail('Location update', `${locPromises.length - locSuccess.length} failed`);
  }

  // End all rides concurrently
  console.log(`  Ending ${rideIds.length} rides concurrently...`);
  const endPromises = rideIds.map((id, i) =>
    authReq(rideTokens[i], `/rides/${id}/end`, {
      method: 'POST',
      body: JSON.stringify({
        latitude: 26.6450,
        longitude: -81.8680,
      }),
    })
  );

  const endResults = await Promise.all(endPromises);
  const endSuccess = endResults.filter(r => r.ok);
  const endLatencies = endResults.map(r => r.latency);

  printStats('End ride', endLatencies, endResults.length - endSuccess.length);

  if (endSuccess.length === rideIds.length) {
    pass(`All ${rideIds.length} rides ended successfully`);
  } else {
    fail('End ride', `${rideIds.length - endSuccess.length} failed`);
  }

  // Double-end attempt
  if (rideIds.length > 0) {
    console.log('  Testing double-end protection...');
    const doubleEnd = await authReq(rideTokens[0], `/rides/${rideIds[0]}/end`, {
      method: 'POST',
      body: JSON.stringify({ latitude: 26.6450, longitude: -81.8680 }),
    });
    if (!doubleEnd.ok) {
      pass('Double-end correctly rejected');
    } else {
      fail('Double-end', 'Ride was ended twice');
    }
  }

  return { endSuccess, tokens: rideTokens, rideIds };
}

// ─── Test 3: Double-Booking Race Condition ─────────────────────

async function testDoubleBooking(tokens) {
  console.log('\n━━━ TEST 3: Double-Booking Race Condition ━━━');

  const { data: scooterData } = await authReq(tokens[0], '/scooters');
  const available = scooterData.scooters.filter(s => s.status === 'available');

  if (available.length === 0) {
    console.log('  No available scooters, skipping...');
    return;
  }

  const targetScooter = available[0];
  console.log(`  ${5} users racing to book scooter ${targetScooter.code}...`);

  // 5 different users try to book the same scooter simultaneously
  const racePromises = Array.from({ length: Math.min(5, tokens.length) }, (_, i) =>
    authReq(tokens[i], '/rides/start', {
      method: 'POST',
      body: JSON.stringify({
        scooter_id: targetScooter.id,
        latitude: 26.6406,
        longitude: -81.8723,
      }),
    })
  );

  const raceResults = await Promise.all(racePromises);
  const winners = raceResults.filter(r => r.ok);
  const losers = raceResults.filter(r => !r.ok);

  console.log(`  Winners: ${winners.length}, Rejected: ${losers.length}`);

  if (winners.length === 1) {
    pass('Exactly 1 user won the race (no double-booking)');
  } else if (winners.length === 0) {
    fail('Double-booking race', 'No user could book (all rejected)');
  } else {
    fail('Double-booking race', `${winners.length} users booked the same scooter!`);
  }

  // Clean up - end the winning ride
  if (winners.length > 0) {
    const winnerToken = tokens[raceResults.indexOf(winners[0])];
    const rideId = winners[0].data.ride.id;
    await authReq(winnerToken, `/rides/${rideId}/end`, {
      method: 'POST',
      body: JSON.stringify({ latitude: 26.6406, longitude: -81.8723 }),
    });
  }
}

// ─── Test 4: Wallet Top-Up Race Condition ──────────────────────

async function testWalletRaceCondition(tokens) {
  console.log('\n━━━ TEST 4: Wallet Top-Up Race Condition ━━━');

  const token = tokens[0];

  // Get initial balance
  const { data: profile } = await authReq(token, '/auth/me');
  const initialBalance = profile.user.balance;
  console.log(`  Initial balance: $${initialBalance.toFixed(2)}`);

  // Fire 10 concurrent $5 top-ups
  const topUpCount = 10;
  console.log(`  Sending ${topUpCount} concurrent $5.00 top-ups...`);

  const topUpPromises = Array.from({ length: topUpCount }, () =>
    authReq(token, '/auth/top-up', {
      method: 'POST',
      body: JSON.stringify({ amount: 5 }),
    })
  );

  const topUpResults = await Promise.all(topUpPromises);
  const topUpSuccess = topUpResults.filter(r => r.ok);
  const topUpLatencies = topUpResults.map(r => r.latency);

  printStats('Top-up', topUpLatencies, topUpCount - topUpSuccess.length);

  // Check final balance
  const { data: finalProfile } = await authReq(token, '/auth/me');
  const finalBalance = finalProfile.user.balance;
  const expectedBalance = initialBalance + (topUpSuccess.length * 5);

  console.log(`  Final balance: $${finalBalance.toFixed(2)} (expected: $${expectedBalance.toFixed(2)})`);

  if (Math.abs(finalBalance - expectedBalance) < 0.01) {
    pass(`Balance is correct after ${topUpSuccess.length} concurrent top-ups`);
  } else {
    fail('Wallet race condition', `Balance mismatch: got $${finalBalance.toFixed(2)}, expected $${expectedBalance.toFixed(2)} (lost $${(expectedBalance - finalBalance).toFixed(2)})`);
  }
}

// ─── Test 5: Invalid Input Bombardment ─────────────────────────

async function testInvalidInputs(tokens) {
  console.log('\n━━━ TEST 5: Invalid Input Bombardment ━━━');

  const token = tokens[0];
  const attacks = [
    ['Empty body registration', () => req('/auth/register', { method: 'POST', body: '{}' })],
    ['SQL injection email', () => req('/auth/login', { method: 'POST', body: JSON.stringify({ email: "' OR 1=1 --", password: 'x' }) })],
    ['XSS in name', () => req('/auth/register', { method: 'POST', body: JSON.stringify({ email: 'xss@test.com', password: 'password123', name: '<script>alert(1)</script>' }) })],
    ['Malformed email', () => req('/auth/register', { method: 'POST', body: JSON.stringify({ email: 'not-an-email', password: 'password123', name: 'Bad Email' }) })],
    ['Email with whitespace', () => req('/auth/register', { method: 'POST', body: JSON.stringify({ email: 'a b@c.com', password: 'password123', name: 'WS' }) })],
    ['Short password', () => req('/auth/register', { method: 'POST', body: JSON.stringify({ email: 'shortpw@test.com', password: 'pass123', name: 'Short PW' }) })],
    ['Oversized name', () => req('/auth/register', { method: 'POST', body: JSON.stringify({ email: 'bigname@test.com', password: 'password123', name: 'x'.repeat(300) }) })],
    ['Negative top-up', () => authReq(token, '/auth/top-up', { method: 'POST', body: JSON.stringify({ amount: -50 }) })],
    ['Zero top-up', () => authReq(token, '/auth/top-up', { method: 'POST', body: JSON.stringify({ amount: 0 }) })],
    ['Huge top-up', () => authReq(token, '/auth/top-up', { method: 'POST', body: JSON.stringify({ amount: 999999 }) })],
    ['String top-up', () => authReq(token, '/auth/top-up', { method: 'POST', body: JSON.stringify({ amount: 'abc' }) })],
    ['NaN latitude ride', () => authReq(token, '/rides/start', { method: 'POST', body: JSON.stringify({ scooter_id: 'fake', latitude: NaN, longitude: -81 }) })],
    ['Missing scooter_id', () => authReq(token, '/rides/start', { method: 'POST', body: JSON.stringify({ latitude: 26, longitude: -81 }) })],
    ['Fake scooter ID', () => authReq(token, '/rides/start', { method: 'POST', body: JSON.stringify({ scooter_id: 'nonexistent-id', latitude: 26, longitude: -81 }) })],
    ['Invalid ride rating', () => authReq(token, '/rides/fake-id/rate', { method: 'POST', body: JSON.stringify({ rating: 99 }) })],
    ['Malformed JSON', () => fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malformed' }).then(r => ({ status: r.status, ok: r.ok, latency: 0 }))],
    ['No auth header', () => req('/auth/me')],
    ['Invalid token', () => authReq('invalid.token.here', '/auth/me')],
  ];

  let serverCrashes = 0;
  const latencies = [];

  for (const [name, fn] of attacks) {
    try {
      const result = await fn();
      latencies.push(result.latency || 0);
      if (result.status >= 500) {
        fail(name, `Server error ${result.status}`);
        serverCrashes++;
      } else if (!result.ok) {
        pass(`${name} → ${result.status} rejected`);
      } else {
        // Some might succeed (like XSS in name - it's stored, but should be escaped on render)
        if (name.includes('XSS')) {
          warn(`XSS payload was accepted in name field (ensure frontend escapes output)`);
          pass(`${name} → stored (React auto-escapes)`);
        } else {
          warn(`${name} unexpectedly succeeded`);
        }
      }
    } catch (err) {
      fail(name, `Exception: ${err.message}`);
      serverCrashes++;
    }
  }

  console.log(`  Server crashes from bad input: ${serverCrashes}`);

  // Verify server is still alive after bombardment
  const health = await req('/health');
  if (health.ok) {
    pass('Server still healthy after invalid input bombardment');
  } else {
    fail('Server health', 'Server crashed or became unresponsive');
  }
}

// ─── Test 6: High-Throughput Read Stress ───────────────────────

async function testReadThroughput(tokens) {
  console.log('\n━━━ TEST 6: High-Throughput Read Stress ━━━');

  const token = tokens[0];
  const readCount = 100;

  console.log(`  Firing ${readCount} concurrent GET /scooters requests...`);
  const start = Date.now();

  const readPromises = Array.from({ length: readCount }, () =>
    authReq(token, '/scooters?lat=26.6406&lng=-81.8723&radius=5000')
  );

  const readResults = await Promise.all(readPromises);
  const totalTime = Date.now() - start;
  const readSuccess = readResults.filter(r => r.ok);
  const readLatencies = readResults.map(r => r.latency);

  printStats('GET /scooters', readLatencies, readCount - readSuccess.length);
  console.log(`  Total wall time: ${totalTime}ms | Throughput: ${Math.round(readCount / (totalTime / 1000))} req/s`);

  if (readSuccess.length === readCount) {
    pass(`All ${readCount} read requests succeeded`);
  } else {
    fail('Read throughput', `${readCount - readSuccess.length} failed`);
  }

  // Verify consistent response data
  const scooterCounts = readSuccess.map(r => r.data.scooters.length);
  const allSame = scooterCounts.every(c => c === scooterCounts[0]);
  if (allSame) {
    pass(`All responses returned consistent data (${scooterCounts[0]} scooters)`);
  } else {
    warn(`Inconsistent scooter counts: min=${Math.min(...scooterCounts)} max=${Math.max(...scooterCounts)}`);
  }

  // Admin dashboard under load
  const adminLogin = await req('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@vim.rides', password: 'admin123' }),
  });
  const adminToken = adminLogin.data.token;

  console.log(`  Firing 20 concurrent admin dashboard requests...`);
  const dashPromises = Array.from({ length: 20 }, () =>
    authReq(adminToken, '/admin/dashboard')
  );
  const dashResults = await Promise.all(dashPromises);
  const dashLatencies = dashResults.map(r => r.latency);
  const dashSuccess = dashResults.filter(r => r.ok);

  printStats('GET /admin/dashboard', dashLatencies, 20 - dashSuccess.length);

  if (dashSuccess.length === 20) {
    pass('All admin dashboard requests succeeded');
  } else {
    fail('Admin dashboard load', `${20 - dashSuccess.length} failed`);
  }
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║    VIM SCOOTER APP - STRESS TEST SUITE   ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Target: ${BASE} | Concurrency: ${CONCURRENCY}`);

  const startTime = Date.now();

  try {
    // Test 1: Auth concurrency
    const tokens = await testAuthConcurrency();

    // Test 2: Ride lifecycle stress
    await testRideLifecycle(tokens);

    // Test 3: Double-booking race condition
    await testDoubleBooking(tokens);

    // Test 4: Wallet race condition
    await testWalletRaceCondition(tokens);

    // Test 5: Invalid input bombardment
    await testInvalidInputs(tokens);

    // Test 6: Read throughput
    await testReadThroughput(tokens);

  } catch (err) {
    console.error('\n  FATAL ERROR:', err.message);
    results.failed++;
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════');
  console.log(`  RESULTS: ${results.passed} passed, ${results.failed} failed (${totalTime}s)`);
  if (results.warnings.length > 0) {
    console.log(`  WARNINGS (${results.warnings.length}):`);
    results.warnings.forEach(w => console.log(`    ⚠ ${w}`));
  }
  console.log('══════════════════════════════════════════\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

main();
