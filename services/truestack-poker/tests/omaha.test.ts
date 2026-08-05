import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  createTable,
  evaluateBestHand,
  evaluateOmahaHand,
  maxPotLimitRaiseTo,
  type Card,
} from '../src/poker-engine.js';
import { PokerService } from '../src/services/poker-service.js';
import { HOLE_CARD_COUNT } from '../src/contracts.js';

function card(id: string): Card {
  const rank = id.slice(0, -1) as Card['rank'];
  const suitKey = id.slice(-1).toLowerCase() as 's' | 'h' | 'd' | 'c';
  const suit = ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[suitKey];
  return { rank, suit, id };
}

const hand = (...ids: string[]): Card[] => ids.map(card);

test('Omaha must use exactly two hole cards: four suited in hand is not a flush', () => {
  // Four hearts in hand plus one heart on the board. Hold'em rules would find a flush by
  // taking four from the hand; Omaha may only ever play two, so this is not a flush.
  const holeCards = hand('Ah', 'Kh', 'Qh', 'Jh');
  const board = hand('2h', '7s', '9d', '4c', '3s');

  const omaha = evaluateOmahaHand(holeCards, board);
  const holdemStyle = evaluateBestHand([...holeCards, ...board]);

  assert.notEqual(omaha.handRank, 'flush', 'only two hole cards may play');
  assert.equal(holdemStyle.handRank, 'flush', 'the Hold-em evaluator would wrongly see a flush here');
});

test('Omaha must use exactly three board cards: a pocket pair alone is not trips', () => {
  // AA in hand with a third ace on the board. Playing both pocket aces plus the board ace
  // requires only two board cards, so the best legal hand uses both aces and three board
  // cards -- three of a kind, not the four-of-a-kind an unconstrained search might find.
  const holeCards = hand('As', 'Ad', '7c', '2h');
  const board = hand('Ac', 'Kd', 'Qs', '5h', '3c');

  const omaha = evaluateOmahaHand(holeCards, board);
  assert.equal(omaha.handRank, 'three of a kind');
});

test('Omaha finds a legitimate flush when exactly two hole cards make it', () => {
  const omaha = evaluateOmahaHand(hand('Ah', 'Kh', '7s', '2c'), hand('3h', '9h', 'Jh', '4s', '6d'));
  assert.equal(omaha.handRank, 'flush');
});

test('Omaha ranks a nut straight above a lower one', () => {
  const board = hand('9h', 'Ts', 'Jd', '2c', '4s');
  const high = evaluateOmahaHand(hand('Qh', 'Kd', '3s', '5c'), board);
  const low = evaluateOmahaHand(hand('7h', '8d', '3s', '5c'), board);
  assert.equal(high.handRank, 'straight');
  assert.equal(low.handRank, 'straight');
  assert.ok(high.rankValues[0] > low.rankValues[0], 'KQ straight beats 87 straight');
});

test('a PLO table deals four hole cards and a Hold-em table deals two', () => {
  assert.equal(HOLE_CARD_COUNT.plo, 4);
  assert.equal(HOLE_CARD_COUNT.nlh, 2);

  const seats = [
    { id: 'a', name: 'A', stack: 100 },
    { id: 'b', name: 'B', stack: 100 },
  ];

  const poker = new PokerService();
  poker.createCashTable('plo-table', 'micro-1', seats, false, 'plo');
  poker.createCashTable('nlh-table', 'micro-1', seats, false, 'nlh');

  assert.equal(poker.getHoleCardsFor('plo-table', 'a').length, 4);
  assert.equal(poker.getHoleCardsFor('nlh-table', 'a').length, 2);
  assert.equal(poker.getTable('plo-table').variant, 'plo');
});

test('pot-limit caps a raise at the pot; no-limit does not', () => {
  const seats = [
    { id: 'a', name: 'A', stack: 500 },
    { id: 'b', name: 'B', stack: 500 },
  ];
  const plo = createTable({ id: 'p', variant: 'plo', smallBlind: 1, bigBlind: 2, players: seats });

  // Heads-up: 'a' posts the small blind and acts first. Pot is 3, facing 1 more to call,
  // so the cap is currentBet 2 + (pot 3 + toCall 1) = 6.
  const cap = maxPotLimitRaiseTo(plo, 'a');
  assert.equal(cap, 6);

  assert.throws(() => applyAction(plo, { playerId: 'a', type: 'raise', amount: 50 }), /Pot-limit/);
  const legal = applyAction(plo, { playerId: 'a', type: 'raise', amount: cap });
  assert.equal(legal.currentBet, cap);

  // The same oversized raise is fine in no-limit.
  const nlh = createTable({ id: 'n', variant: 'nlh', smallBlind: 1, bigBlind: 2, players: seats });
  assert.doesNotThrow(() => applyAction(nlh, { playerId: 'a', type: 'raise', amount: 50 }));
});

test('a pot-limit all-in is capped at the pot and leaves the seat with chips behind', () => {
  const plo = createTable({
    id: 'p2',
    variant: 'plo',
    smallBlind: 1,
    bigBlind: 2,
    players: [
      { id: 'a', name: 'A', stack: 500 },
      { id: 'b', name: 'B', stack: 500 },
    ],
  });

  const cap = maxPotLimitRaiseTo(plo, 'a');
  const next = applyAction(plo, { playerId: 'a', type: 'all-in' });
  const seat = next.players.find((entry) => entry.id === 'a');
  assert.ok(seat);

  assert.equal(seat.streetContribution, cap, 'commitment is capped at the pot');
  assert.ok(seat.stack > 0, 'a capped shove must leave chips behind');
  // Marking this seat all-in would freeze it out of the hand while it still had chips.
  assert.equal(seat.allIn, false);
});

test('a short stack can still commit everything under pot limit', () => {
  const plo = createTable({
    id: 'p3',
    variant: 'plo',
    smallBlind: 1,
    bigBlind: 2,
    players: [
      { id: 'a', name: 'A', stack: 4 },
      { id: 'b', name: 'B', stack: 500 },
    ],
  });

  const next = applyAction(plo, { playerId: 'a', type: 'all-in' });
  const seat = next.players.find((entry) => entry.id === 'a');
  assert.equal(seat?.stack, 0);
  assert.equal(seat?.allIn, true);
});
