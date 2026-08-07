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

test('progress (hands/win streak) is available from the very first hand, unlike getStats', () => {
  const stats = new PlayerStatsService();
  stats.recordHandDealt('t1', 'p1');
  stats.recordHandResult(['p1', 'p2'], ['p1']);

  assert.equal(stats.getStats('p1'), null); // still hidden -- sample too small
  assert.deepEqual(stats.getProgress('p1'), { hands: 1, winStreak: 1, bestWinStreak: 1, coldStreak: 0 });
});

test('a loss builds a cold streak; a win clears it', () => {
  const stats = new PlayerStatsService();
  stats.recordHandDealt('t1', 'p1');
  stats.recordHandResult(['p1', 'p2'], ['p2']);
  stats.recordHandResult(['p1', 'p2'], ['p2']);
  assert.equal(stats.getProgress('p1').coldStreak, 2);

  stats.recordHandResult(['p1', 'p2'], ['p1']);
  assert.equal(stats.getProgress('p1').coldStreak, 0);
  assert.equal(stats.getProgress('p1').winStreak, 1);
});

test('a loss resets the win streak; a fresh win starts a new one', () => {
  const stats = new PlayerStatsService();
  for (let i = 0; i < 3; i += 1) stats.recordHandDealt('t1', 'p1');
  stats.recordHandResult(['p1', 'p2'], ['p1']);
  stats.recordHandResult(['p1', 'p2'], ['p1']);
  stats.recordHandResult(['p1', 'p2'], ['p2']); // p1 loses
  stats.recordHandResult(['p1', 'p2'], ['p1']);

  assert.deepEqual(stats.getProgress('p1'), { hands: 3, winStreak: 1, bestWinStreak: 2, coldStreak: 0 });
});

test('a split pot counts every listed winner, not just the first', () => {
  const stats = new PlayerStatsService();
  stats.recordHandDealt('t1', 'p1');
  stats.recordHandDealt('t1', 'p2');
  stats.recordHandResult(['p1', 'p2'], ['p1', 'p2']);

  assert.equal(stats.getProgress('p1').winStreak, 1);
  assert.equal(stats.getProgress('p2').winStreak, 1);
});

test('a player never dealt in has zero progress rather than throwing', () => {
  const stats = new PlayerStatsService();
  assert.deepEqual(stats.getProgress('ghost'), { hands: 0, winStreak: 0, bestWinStreak: 0, coldStreak: 0 });
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
