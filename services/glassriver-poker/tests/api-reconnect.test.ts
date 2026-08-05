import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultServices, createPlatformServer } from '../src/app-server.js';

test('exposes lobby endpoints and health status', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
    const health = await healthRes.json();
    assert.equal(healthRes.status, 200);
    assert.equal(health.zeroRake.rakePercent, 0);

    const lobbyRes = await fetch(`http://127.0.0.1:${port}/api/lobby/cash-games?minBlind=0.01`);
    const lobby = await lobbyRes.json();
    assert.equal(lobbyRes.status, 200);
    assert.ok(Array.isArray(lobby.listings));
    assert.ok(lobby.listings.length > 0);
  } finally {
    await app.stop();
  }
});

test('issues and consumes reconnect tokens through session endpoints', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    const joinRes = await fetch(`http://127.0.0.1:${port}/api/tables/cash-aurora/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'p4', username: 'Nina', buyIn: 50 }),
    });

    const joinPayload = await joinRes.json();
    assert.equal(joinRes.status, 200);
    assert.equal(typeof joinPayload.reconnectToken, 'string');
    assert.ok(joinPayload.reconnectToken.length > 10);

    const reconnectRes = await fetch(`http://127.0.0.1:${port}/api/sessions/reconnect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reconnectToken: joinPayload.reconnectToken }),
    });

    const reconnectPayload = await reconnectRes.json();
    assert.equal(reconnectRes.status, 200);
    assert.equal(reconnectPayload.userId, 'p4');
    assert.equal(reconnectPayload.tableId, 'cash-aurora');

    const secondAttempt = await fetch(`http://127.0.0.1:${port}/api/sessions/reconnect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reconnectToken: joinPayload.reconnectToken }),
    });

    assert.equal(secondAttempt.status, 500);
  } finally {
    await app.stop();
  }
});

test('accepts direct multiplayer action endpoint updates', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    const actionRes = await fetch(`http://127.0.0.1:${port}/api/tables/cash-aurora/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: 'p1',
        action: { type: 'bet', amount: 25 },
      }),
    });

    const actionPayload = await actionRes.json();
    assert.equal(actionRes.status, 200);
    assert.equal(actionPayload.table.pot, 25);
  } finally {
    await app.stop();
  }
});

test('registers players into tournaments and exposes registration list', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    const registerRes = await fetch(`http://127.0.0.1:${port}/api/tournaments/daily-royal/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'p7', username: 'Ivy' }),
    });

    const registerPayload = await registerRes.json();
    assert.equal(registerRes.status, 200);
    assert.equal(registerPayload.registration.userId, 'p7');

    const listRes = await fetch(`http://127.0.0.1:${port}/api/tournaments/daily-royal/registrations`);
    const listPayload = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listPayload.registrations));
    assert.equal(listPayload.registrations.length, 1);
    assert.equal(listPayload.registrations[0].userId, 'p7');
  } finally {
    await app.stop();
  }
});
