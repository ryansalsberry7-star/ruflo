import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerStatsService } from '../src/services/player-stats-service.js';

test('hides VPIP/PFR until the sample size is meaningful', () => {
  const stats = new PlayerStatsService();
  stats.recordHandDealt('t1', 'p1');
  stats.recordAction('t1', 'p1', 'raise', 'preflop');

  assert.equal(stats.getStats('p1'), null);
});

test('VPIP counts any voluntary preflop action once per hand; PFR only bet/raise', () => {
  const stats = new PlayerStatsService();

  // Hand 1: calls preflop (VPIP, not PFR), then re-raises later the same street -- still
  // one VPIP count, but this raise also earns a PFR count.
  stats.recordHandDealt('t1', 'p1');
  stats.recordAction('t1', 'p1', 'call', 'preflop');
  stats.recordAction('t1', 'p1', 'raise', 'preflop');

  // Hand 2: folds preflop without ever voluntarily putting money in.
  stats.recordHandDealt('t1', 'p1');
  stats.recordAction('t1', 'p1', 'fold', 'preflop');

  // Hands 3-5: dealt in, no action recorded (e.g. folded holding the big blind's own
  // walk) -- still count toward the denominator.
  stats.recordHandDealt('t1', 'p1');
  stats.recordHandDealt('t1', 'p1');
  stats.recordHandDealt('t1', 'p1');

  const result = stats.getStats('p1');
  assert.ok(result);
  assert.equal(result?.hands, 5);
  assert.equal(result?.vpip, 1);
  assert.equal(result?.pfr, 1);
});

test('postflop actions never count toward preflop-only VPIP/PFR', () => {
  const stats = new PlayerStatsService();
  for (let i = 0; i < 5; i += 1) stats.recordHandDealt('t1', 'p1');
  stats.recordAction('t1', 'p1', 'bet', 'flop');
  stats.recordAction('t1', 'p1', 'raise', 'turn');

  const result = stats.getStats('p1');
  assert.equal(result?.vpip, 0);
  assert.equal(result?.pfr, 0);
});

test('an all-in preflop counts toward VPIP but not PFR (call vs. raise is ambiguous)', () => {
  const stats = new PlayerStatsService();
  for (let i = 0; i < 5; i += 1) stats.recordHandDealt('t1', 'p1');
  stats.recordAction('t1', 'p1', 'all-in', 'preflop');

  const result = stats.getStats('p1');
  assert.equal(result?.vpip, 1);
  assert.equal(result?.pfr, 0);
});

test('per-hand dedup is scoped per table, not global', () => {
  const stats = new PlayerStatsService();
  for (let i = 0; i < 5; i += 1) {
    stats.recordHandDealt('table-a', 'p1');
    stats.recordHandDealt('table-b', 'p1');
  }
  stats.recordAction('table-a', 'p1', 'call', 'preflop');
  stats.recordAction('table-a', 'p1', 'call', 'preflop');
  stats.recordAction('table-b', 'p1', 'call', 'preflop');

  const result = stats.getStats('p1');
  assert.equal(result?.hands, 10);
  assert.equal(result?.vpip, 2);
});
