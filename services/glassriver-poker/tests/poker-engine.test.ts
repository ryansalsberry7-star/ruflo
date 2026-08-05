import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createTable, dealFlop, dealRiver, dealTurn, evaluateHandRank } from '../src/poker-engine.js';

const deterministicDeck = [
  { suit: 'clubs', rank: '2', id: '2c' },
  { suit: 'diamonds', rank: '2', id: '2d' },
  { suit: 'hearts', rank: '4', id: '4h' },
  { suit: 'spades', rank: '5', id: '5s' },
  { suit: 'clubs', rank: '6', id: '6c' },
  { suit: 'diamonds', rank: '7', id: '7d' },
  { suit: 'hearts', rank: '8', id: '8h' },
  { suit: 'spades', rank: '9', id: '9s' },
  { suit: 'clubs', rank: 'T', id: 'Tc' },
  { suit: 'diamonds', rank: 'J', id: 'Jd' },
  { suit: 'hearts', rank: 'Q', id: 'Qh' },
  { suit: 'spades', rank: 'K', id: 'Ks' },
  { suit: 'clubs', rank: 'A', id: 'Ac' },
  { suit: 'diamonds', rank: '2', id: '2d' },
  { suit: 'hearts', rank: '3', id: '3h' },
  { suit: 'spades', rank: '4', id: '4s' },
  { suit: 'clubs', rank: '5', id: '5c' },
  { suit: 'diamonds', rank: '6', id: '6d' },
  { suit: 'hearts', rank: '7', id: '7h' },
  { suit: 'spades', rank: '8', id: '8s' },
  { suit: 'clubs', rank: '9', id: '9c' },
  { suit: 'diamonds', rank: 'T', id: 'Td' },
  { suit: 'hearts', rank: 'J', id: 'Jh' },
  { suit: 'spades', rank: 'Q', id: 'Qs' },
  { suit: 'clubs', rank: 'K', id: 'Kc' },
  { suit: 'diamonds', rank: 'A', id: 'Ad' },
  { suit: 'hearts', rank: '2', id: '2h' },
  { suit: 'spades', rank: '3', id: '3s' },
  { suit: 'clubs', rank: '4', id: '4c' },
  { suit: 'diamonds', rank: '5', id: '5d' },
  { suit: 'hearts', rank: '6', id: '6h' },
  { suit: 'spades', rank: '7', id: '7s' },
  { suit: 'clubs', rank: '8', id: '8c' },
  { suit: 'diamonds', rank: '9', id: '9d' },
  { suit: 'hearts', rank: 'T', id: 'Th' },
  { suit: 'spades', rank: 'J', id: 'Js' },
  { suit: 'clubs', rank: 'Q', id: 'Qc' },
  { suit: 'diamonds', rank: 'K', id: 'Kd' },
  { suit: 'hearts', rank: 'A', id: 'Ah' },
  { suit: 'spades', rank: 'A', id: 'As' },
] as const;

test('creates a table with a dealer and blinds', () => {
  const table = createTable({
    id: 'table-1',
    smallBlind: 5,
    bigBlind: 10,
    players: [
      { id: 'p1', name: 'Ada', stack: 1000 },
      { id: 'p2', name: 'Linus', stack: 1000 },
      { id: 'p3', name: 'Grace', stack: 1000 },
    ],
  });

  assert.equal(table.players[0].isDealer, true);
  assert.equal(table.players[1].isSmallBlind, true);
  assert.equal(table.players[2].isBigBlind, true);
});

test('applies folds and tracks action history', () => {
  const table = createTable({
    id: 'table-2',
    smallBlind: 5,
    bigBlind: 10,
    players: [
      { id: 'p1', name: 'Ada', stack: 1000 },
      { id: 'p2', name: 'Linus', stack: 1000 },
      { id: 'p3', name: 'Grace', stack: 1000 },
    ],
  });

  const updated = applyAction(table, { playerId: 'p1', type: 'fold' });

  assert.equal(updated.players[0].folded, true);
  assert.equal(updated.actionHistory.length, 1);
});

test('deals street cards and evaluates a hand rank', () => {
  let table = createTable({ id: 'table-3', smallBlind: 5, bigBlind: 10, players: [{ id: 'p1', name: 'Ada', stack: 1000 }], deck: [...deterministicDeck] as any });
  table = dealFlop(table);
  table = dealTurn(table);
  table = dealRiver(table);

  assert.equal(table.currentStreet, 'river');
  assert.equal(table.communityCards.length, 5);
  assert.equal(evaluateHandRank(table.communityCards), 'pair');
});
