import test from 'node:test';
import assert from 'node:assert/strict';
import { BotService, decideBotAction, estimateHandStrength } from '../src/services/bot-service.js';
import { PokerService } from '../src/services/poker-service.js';
import type { Card, TableState } from '../src/poker-engine.js';

function card(id: string): Card {
  const rank = id.slice(0, -1) as Card['rank'];
  const suitKey = id.slice(-1).toLowerCase();
  const suit = ({ s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const)[
    suitKey as 's' | 'h' | 'd' | 'c'
  ];
  return { rank, suit, id };
}

function tableWith(overrides: Partial<TableState> = {}): TableState {
  return {
    id: 't',
    smallBlind: 0.5,
    bigBlind: 1,
    buttonIndex: 0,
    currentStreet: 'flop',
    pot: 10,
    sidePots: [],
    players: [
      {
        id: 'bot',
        name: 'Bot',
        stack: 100,
        folded: false,
        allIn: false,
        isDealer: false,
        isSmallBlind: false,
        isBigBlind: false,
        streetContribution: 0,
        isBot: true,
      },
    ],
    deck: [],
    communityCards: [],
    actionHistory: [],
    currentTurn: 'bot',
    completed: false,
    currentBet: 0,
    minRaise: 1,
    actedThisRound: [],
    ...overrides,
  };
}

test('hand strength ranks premium holdings above trash', () => {
  const aces = estimateHandStrength([card('As'), card('Ah')], []);
  const trash = estimateHandStrength([card('7s'), card('2h')], []);
  assert.ok(aces > trash, `AA (${aces}) should beat 72o (${trash})`);
  assert.ok(aces <= 1 && trash >= 0);
});

test('hand strength reflects the made hand once a board exists', () => {
  const board = [card('Ah'), card('Kh'), card('Qh')];
  const flush = estimateHandStrength([card('Jh'), card('Th')], board);
  const airball = estimateHandStrength([card('3c'), card('2d')], board);
  assert.ok(flush > airball, `straight flush (${flush}) should beat air (${airball})`);
});

test('a bot checks rather than betting when nothing is outstanding and the hand is weak', () => {
  const decision = decideBotAction(
    tableWith({ currentBet: 0, communityCards: [card('Ah'), card('Kd'), card('Qc')] }),
    'bot',
    [card('7s'), card('2h')],
    'tight',
    () => 0.99
  );
  assert.equal(decision.type, 'check');
});

test('a bot folds a weak hand facing a large bet', () => {
  const decision = decideBotAction(
    tableWith({ currentBet: 40, pot: 50, communityCards: [card('Ah'), card('Kd'), card('Qc')] }),
    'bot',
    [card('7s'), card('2h')],
    'tight',
    () => 0.5
  );
  assert.equal(decision.type, 'fold');
});

test('a bot continues with a strong made hand facing a bet', () => {
  const decision = decideBotAction(
    tableWith({ currentBet: 10, pot: 30, communityCards: [card('Ah'), card('Ad'), card('Ac')] }),
    'bot',
    [card('As'), card('Kh')],
    'balanced',
    () => 0.99 // suppress the raise roll so the passive branch is exercised
  );
  assert.equal(decision.type, 'call');
  assert.equal(decision.amount, 10);
});

test('a bot never proposes a raise beyond its stack', () => {
  const decision = decideBotAction(
    tableWith(
      { currentBet: 5, pot: 400, communityCards: [card('Ah'), card('Ad'), card('Ac')] },
      ),
    'bot',
    [card('As'), card('Kh')],
    'loose-aggressive',
    () => 0
  );
  const seat = tableWith().players[0];
  if (decision.type === 'raise') {
    assert.ok(decision.amount <= seat.streetContribution + seat.stack, 'raise must fit the stack');
  } else {
    assert.equal(decision.type, 'all-in', 'otherwise it should shove');
  }
});

test('BotService refuses to construct in production', () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => new BotService(new PokerService()), /cannot run in production/);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test('seated bots are flagged on the table and can be removed', () => {
  const poker = new PokerService();
  poker.createCashTable('t-bots', 'micro-1', [{ id: 'hero', name: 'Hero', stack: 100 }]);
  const bots = new BotService(poker, { thinkTimeMs: 0, thinkJitterMs: 0 });

  const seated = bots.seatBots('t-bots', 3);
  assert.equal(seated.length, 3);

  const table = poker.getTable('t-bots');
  // Every simulated seat must be identifiable; the product claims no house players.
  assert.equal(table.players.filter((entry) => entry.isBot).length, 3);
  assert.equal(table.players.find((entry) => entry.id === 'hero')?.isBot, undefined);

  // Seating is idempotent, so a repeated call cannot stack duplicate bots.
  assert.equal(bots.seatBots('t-bots', 3).length, 0);

  assert.equal(bots.removeBots('t-bots'), 3);
  assert.equal(poker.getTable('t-bots').players.filter((entry) => entry.isBot).length, 0);
});

test('bots play full hands without leaking chips', async () => {
  const poker = new PokerService(undefined, undefined, { autoProgress: true });
  poker.createCashTable('t-run', 'micro-1', [{ id: 'hero', name: 'Hero', stack: 100 }]);
  const bots = new BotService(poker, { thinkTimeMs: 0, thinkJitterMs: 0 });
  bots.seatBots('t-run', 3, 100);

  const total = () => {
    const table = poker.getTable('t-run');
    return Number((table.players.reduce((sum, p) => sum + p.stack, 0) + table.pot).toFixed(2));
  };
  const start = total();

  let settled = 0;
  poker.on('hand-settled', () => {
    settled += 1;
  });

  bots.start(1);
  const heroFolds = setInterval(() => {
    try {
      if (poker.getTable('t-run').currentTurn === 'hero') poker.applyPlayerAction('t-run', 'hero', 'fold', 0);
    } catch {
      // Hero may no longer be to act; the next tick re-checks.
    }
  }, 1);

  await new Promise((resolve) => setTimeout(resolve, 600));
  bots.stop();
  clearInterval(heroFolds);

  assert.ok(settled > 0, 'bots should complete at least one hand');
  // Zero rake means the table total is invariant no matter how many hands ran.
  assert.equal(total(), start, 'chips leaked while bots were playing');
});
