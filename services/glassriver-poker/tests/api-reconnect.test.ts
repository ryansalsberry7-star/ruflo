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

test('serves fair-play verification and replay payloads for completed hands', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    services.poker.applyPlayerAction('cash-aurora', 'p1', 'bet', 10);
    services.poker.applyPlayerAction('cash-aurora', 'p2', 'call', 10);
    services.poker.advanceStreet('cash-aurora');
    services.poker.advanceStreet('cash-aurora');
    services.poker.advanceStreet('cash-aurora');
    const settled = services.poker.settleHand('cash-aurora');

    const verificationRes = await fetch(`http://127.0.0.1:${port}/api/hands/${settled.handId}/verification`);
    const verificationPayload = await verificationRes.json();
    assert.equal(verificationRes.status, 200);
    assert.equal(verificationPayload.verification.handId, settled.handId);
    assert.equal(verificationPayload.verification.deckGeneration.source, 'server-crypto-rng');

    const replayRes = await fetch(`http://127.0.0.1:${port}/api/tables/cash-aurora/replay/${settled.handId}`);
    const replayPayload = await replayRes.json();
    assert.equal(replayRes.status, 200);
    assert.ok(Array.isArray(replayPayload.events));
    assert.ok(replayPayload.events.length > 0);

    const spectatorRes = await fetch(`http://127.0.0.1:${port}/api/spectator/featured-tables`);
    const spectatorPayload = await spectatorRes.json();
    assert.equal(spectatorRes.status, 200);
    assert.ok(Array.isArray(spectatorPayload.featuredTables));
  } finally {
    await app.stop();
  }
});

test('exposes trust center and verified human profile endpoints', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    const centerRes = await fetch(`http://127.0.0.1:${port}/api/transparency/trust-center`);
    const center = await centerRes.json();
    assert.equal(centerRes.status, 200);
    assert.equal(center.trustCenter.noUndisclosedAiPlayers, true);

    const verifyRes = await fetch(`http://127.0.0.1:${port}/api/trust/p9/verify-human`, {
      method: 'POST',
    });
    const verify = await verifyRes.json();
    assert.equal(verifyRes.status, 200);
    assert.equal(verify.trust.verifiedHuman, true);

    const profileRes = await fetch(`http://127.0.0.1:${port}/api/trust/p9`);
    const profile = await profileRes.json();
    assert.equal(profileRes.status, 200);
    assert.equal(profile.trust.verifiedHumanBadge, 'verified-human');
  } finally {
    await app.stop();
  }
});

test('supports social clubs, ai hand analysis, and find-my-game matchmaking', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    services.poker.applyPlayerAction('cash-aurora', 'p1', 'bet', 15);
    services.poker.applyPlayerAction('cash-aurora', 'p2', 'call', 15);
    const settled = services.poker.settleHand('cash-aurora');

    const clubRes = await fetch(`http://127.0.0.1:${port}/api/social/clubs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: 'p1', name: 'Night Owls', description: 'Home game regulars' }),
    });
    const clubPayload = await clubRes.json();
    assert.equal(clubRes.status, 200);
    assert.ok(clubPayload.club.id.length > 0);

    const coachRes = await fetch(
      `http://127.0.0.1:${port}/api/coach/hands/${settled.handId}/analyze?userId=p1&tableId=cash-aurora`
    );
    const coachPayload = await coachRes.json();
    assert.equal(coachRes.status, 200);
    assert.equal(coachPayload.analysis.handId, settled.handId);
    assert.ok(Array.isArray(coachPayload.analysis.betterPlays));

    const matchRes = await fetch(`http://127.0.0.1:${port}/api/lobby/find-my-game`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'p1', stakes: 'micro', speed: 'standard', tableSize: 6, skillLevel: 'beginner' }),
    });
    const matchPayload = await matchRes.json();
    assert.equal(matchRes.status, 200);
    assert.ok(Array.isArray(matchPayload.recommendations));
  } finally {
    await app.stop();
  }
});

test('bootstraps, logs in, and registers auth sessions for app user context', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    const bootstrapRes = await fetch(`http://127.0.0.1:${port}/api/auth/session`);
    const bootstrapPayload = await bootstrapRes.json();
    assert.equal(bootstrapRes.status, 200);
    assert.equal(bootstrapPayload.session.userId, 'p1');

    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'Linus' }),
    });
    const loginPayload = await loginRes.json();
    assert.equal(loginRes.status, 200);
    assert.equal(loginPayload.session.userId, 'p2');

    const registerRes = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'RiverFox' }),
    });
    const registerPayload = await registerRes.json();
    assert.equal(registerRes.status, 200);
    assert.equal(registerPayload.created, true);
    assert.equal(registerPayload.session.username, 'RiverFox');
    assert.ok(registerPayload.session.userId.length > 0);
  } finally {
    await app.stop();
  }
});

test('restores stored auth token sessions and revokes them on logout', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services);
  const port = await app.start(0);

  try {
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'Grace' }),
    });
    const loginPayload = await loginRes.json();
    assert.equal(loginRes.status, 200);

    const restoreRes = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
      headers: {
        authorization: `Bearer ${loginPayload.authToken}`,
      },
    });
    const restorePayload = await restoreRes.json();
    assert.equal(restoreRes.status, 200);
    assert.equal(restorePayload.session.userId, 'p3');
    assert.equal(restorePayload.source, 'stored-auth-token');

    const logoutRes = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${loginPayload.authToken}`,
      },
    });
    const logoutPayload = await logoutRes.json();
    assert.equal(logoutRes.status, 200);
    assert.equal(logoutPayload.ok, true);

    const fallbackRes = await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
      headers: {
        authorization: `Bearer ${loginPayload.authToken}`,
      },
    });
    const fallbackPayload = await fallbackRes.json();
    assert.equal(fallbackRes.status, 200);
    assert.equal(fallbackPayload.session.userId, 'p1');
    assert.equal(fallbackPayload.source, 'bootstrap');
  } finally {
    await app.stop();
  }
});
