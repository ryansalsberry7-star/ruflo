import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { buildDefaultServices, createPlatformServer } from '../src/app-server.js';

interface WsEnvelope {
  event: string;
  payload?: Record<string, unknown>;
}

function waitForEvent(socket: WebSocket, event: string, timeoutMs = 1500): Promise<WsEnvelope> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const onMessage = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as WsEnvelope;
      if (message.event !== event) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    };

    socket.on('message', onMessage);
  });
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', (error) => reject(error));
  });
}

test('allows websocket reconnect using reconnect token within grace window', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services, { gateway: { disconnectGraceMs: 500 } });
  const port = await app.start(0);

  const baseUrl = `ws://127.0.0.1:${port}/ws`;
  const first = await openSocket(baseUrl);

  try {
    first.send(JSON.stringify({ event: 'auth', payload: { userId: 'p1', tableId: 'cash-aurora' } }));
    const authOk = await waitForEvent(first, 'auth_ok');
    const reconnectToken = String(authOk.payload?.reconnectToken ?? '');
    assert.ok(reconnectToken.length > 10);

    first.send(JSON.stringify({ event: 'subscribe_table', payload: { tableId: 'cash-aurora' } }));
    await waitForEvent(first, 'table_sync');

    first.close();

    const second = await openSocket(baseUrl);
    try {
      second.send(JSON.stringify({ event: 'auth', payload: { reconnectToken } }));
      const reconnectOk = await waitForEvent(second, 'reconnect_ok');
      assert.equal(reconnectOk.payload?.userId, 'p1');
      assert.equal(reconnectOk.payload?.tableId, 'cash-aurora');
    } finally {
      second.close();
    }
  } finally {
    await app.stop();
  }
});

test('marks disconnected players as timed out and auto-folds after grace window', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services, { gateway: { disconnectGraceMs: 50 } });
  const port = await app.start(0);

  const baseUrl = `ws://127.0.0.1:${port}/ws`;
  const observer = await openSocket(baseUrl);
  const actor = await openSocket(baseUrl);

  try {
    observer.send(JSON.stringify({ event: 'auth', payload: { userId: 'p2', tableId: 'cash-aurora' } }));
    await waitForEvent(observer, 'auth_ok');
    observer.send(JSON.stringify({ event: 'subscribe_table', payload: { tableId: 'cash-aurora' } }));
    await waitForEvent(observer, 'table_sync');

    actor.send(JSON.stringify({ event: 'auth', payload: { userId: 'p1', tableId: 'cash-aurora' } }));
    await waitForEvent(actor, 'auth_ok');
    actor.send(JSON.stringify({ event: 'subscribe_table', payload: { tableId: 'cash-aurora' } }));
    await waitForEvent(actor, 'table_sync');

    actor.close();

    const disconnected = await waitForEvent(observer, 'player_disconnected');
    assert.equal(disconnected.payload?.userId, 'p1');

    const timedOut = await waitForEvent(observer, 'player_timed_out');
    assert.equal(timedOut.payload?.userId, 'p1');

    const table = services.poker.getTable('cash-aurora');
    const p1 = table.players.find((entry) => entry.id === 'p1');
    assert.ok(p1);
    assert.equal(p1?.folded, true);
  } finally {
    observer.close();
    await app.stop();
  }
});

test('forces fold when per-turn action timer expires', async () => {
  const services = buildDefaultServices();
  const app = createPlatformServer(services, {
    gateway: {
      disconnectGraceMs: 500,
      turnActionMs: 40,
    },
  });
  const port = await app.start(0);

  const baseUrl = `ws://127.0.0.1:${port}/ws`;
  const observer = await openSocket(baseUrl);

  try {
    observer.send(JSON.stringify({ event: 'auth', payload: { userId: 'p2', tableId: 'cash-aurora' } }));
    await waitForEvent(observer, 'auth_ok');
    observer.send(JSON.stringify({ event: 'subscribe_table', payload: { tableId: 'cash-aurora' } }));
    await waitForEvent(observer, 'table_sync');

    const timerStarted = await waitForEvent(observer, 'turn_timer_started');
    assert.equal(timerStarted.payload?.tableId, 'cash-aurora');
    const expectedTimedOutUser = String(timerStarted.payload?.currentTurn ?? '');
    assert.ok(expectedTimedOutUser.length > 0);

    const timedOut = await waitForEvent(observer, 'turn_action_timed_out');
    assert.equal(timedOut.payload?.userId, expectedTimedOutUser);

    const table = services.poker.getTable('cash-aurora');
    const timedOutSeat = table.players.find((entry) => entry.id === expectedTimedOutUser);
    assert.ok(timedOutSeat);
    assert.equal(timedOutSeat?.folded, true);
    assert.notEqual(table.currentTurn, expectedTimedOutUser);
  } finally {
    observer.close();
    await app.stop();
  }
});
