import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PokerService } from '../src/services/poker-service.js';
import { PaymentService } from '../src/services/payment-service.js';
import { ComplianceService } from '../src/services/compliance-service.js';
import { WalletService } from '../src/services/wallet-service.js';
import { CoachService } from '../src/services/coach-service.js';
import { CommunityService } from '../src/services/community-service.js';
import { HighHandService } from '../src/services/high-hand-service.js';
import { SessionService } from '../src/services/session-service.js';
import { TrustService } from '../src/services/trust-service.js';

test('settles hands with zero rake and full player-to-player pot distribution', () => {
  const poker = new PokerService();
  poker.createCashTable('table-zero-rake', 'micro-1', [
    { id: 'p1', name: 'Ada', stack: 1000 },
    { id: 'p2', name: 'Linus', stack: 1000 },
  ]);

  poker.applyPlayerAction('table-zero-rake', 'p1', 'raise', 10);
  poker.applyPlayerAction('table-zero-rake', 'p2', 'call', 10);

  const settled = poker.settleHand('table-zero-rake');
  const payoutTotal = settled.payouts.reduce((sum, entry) => sum + entry.amount, 0);

  assert.equal(settled.rakeTaken, 0);
  assert.equal(settled.zeroRakePolicy.rakePercent, 0);
  assert.equal(Number(payoutTotal.toFixed(2)), Number(settled.totalPot.toFixed(2)));
});

test('hole cards are returned only to the seated player who owns them', () => {
  const poker = new PokerService();
  poker.createCashTable('table-hole', 'micro-1', [
    { id: 'p1', name: 'Ada', stack: 100 },
    { id: 'p2', name: 'Linus', stack: 100 },
  ]);

  const ada = poker.getHoleCardsFor('table-hole', 'p1');
  const linus = poker.getHoleCardsFor('table-hole', 'p2');

  assert.equal(ada.length, 2);
  assert.equal(linus.length, 2);
  // Two players must never be dealt the same physical card.
  const overlap = ada.filter((card) => linus.some((other) => other.id === card.id));
  assert.deepEqual(overlap, []);

  // Anyone not seated at the table gets nothing back, so a spectator socket cannot
  // fish for another player's hand by asking for it.
  assert.deepEqual(poker.getHoleCardsFor('table-hole', 'spectator'), []);
});

test('settled pots are paid into the winner stacks, not cashed out to wallets', () => {
  const wallet = new WalletService();
  const poker = new PokerService(undefined, wallet);
  for (const id of ['p1', 'p2']) wallet.ensureWallet(id);
  const walletBefore = wallet.getWallet('p1').availableChips;

  poker.createCashTable('table-payout', 'micro-1', [
    { id: 'p1', name: 'Ada', stack: 100 },
    { id: 'p2', name: 'Linus', stack: 100 },
  ]);

  poker.applyPlayerAction('table-payout', 'p1', 'raise', 10);
  poker.applyPlayerAction('table-payout', 'p2', 'call', 10);
  const settled = poker.settleHand('table-payout');

  const winner = settled.payouts[0].playerId;
  const seat = poker.getTable('table-payout').players.find((entry) => entry.id === winner);
  assert.ok(seat);

  // The winner keeps playing with the pot in their stack. Starting stack was 100, they
  // committed 10, and the next hand's blind is already posted -- so the seat must hold
  // more than the 90 they were left with after betting.
  assert.ok(seat.stack > 90, `winner stack ${seat.stack} should include the won pot`);

  // Winning must not move money in or out of the wallet; only buy-in and cash-out do.
  assert.equal(wallet.getWallet('p1').availableChips, walletBefore);
  assert.equal(wallet.getWallet('p2').availableChips, walletBefore);
});

test('chips are conserved at the table across repeated settled hands', () => {
  const poker = new PokerService(undefined, undefined, { autoProgress: true });
  const seats = ['p1', 'p2', 'p3'];
  poker.createCashTable(
    'table-conserve',
    'micro-1',
    seats.map((id) => ({ id, name: id, stack: 100 }))
  );

  const totalChips = () => {
    const table = poker.getTable('table-conserve');
    return Number((table.players.reduce((sum, p) => sum + p.stack, 0) + table.pot).toFixed(2));
  };
  const start = totalChips();

  // Check/call several hands down. No rake means the table total can never change.
  for (let hand = 0; hand < 5; hand += 1) {
    for (let step = 0; step < 40; step += 1) {
      const table = poker.getTable('table-conserve');
      const turn = table.currentTurn;
      if (!turn) break;
      const actor = table.players.find((p) => p.id === turn);
      if (!actor) break;
      const toCall = table.currentBet - actor.streetContribution;
      try {
        poker.applyPlayerAction('table-conserve', turn, toCall > 0 ? 'call' : 'check', 0);
      } catch {
        break;
      }
    }
    assert.equal(totalChips(), start, `chips leaked after hand ${hand + 1}`);
  }
});

test('a player who joins mid-hand does not stall the betting round forever', () => {
  // A player who joins is added to table.players immediately (so the client can render
  // their seat) but is not dealt into the hand already in progress. isBettingRoundClosed
  // and turn rotation both used to scan every seated player rather than just the ones
  // actually dealt in, so a joiner could never satisfy "has acted" and the round -- and
  // the whole hand -- would silently freeze forever the moment anyone joined mid-hand.
  const poker = new PokerService(undefined, undefined, { autoProgress: true });
  poker.createCashTable('table-midjoin', 'micro-1', [
    { id: 'p1', name: 'Ada', stack: 100 },
    { id: 'p2', name: 'Linus', stack: 100 },
  ]);

  // One real action first, so the table no longer looks "fresh" to joinTable's own
  // freshly-created-table check -- this test is specifically about joining an
  // already-in-progress hand, not triggering that separate path.
  const preJoinTurn = poker.getTable('table-midjoin').currentTurn ?? '';
  poker.applyPlayerAction('table-midjoin', preJoinTurn, 'call', 0);

  poker.joinTable('table-midjoin', { id: 'p3', name: 'Grace', stack: 100 });

  // Drive only the two real hand participants, exactly like production: nothing ever
  // sends an action on behalf of a player who was never dealt cards for this hand (no
  // bot drives them, and a real client has no cards to prompt the human with). Before
  // the fix, turn rotation would hand p3 a turn here -- and even if it hadn't, the
  // betting round could never close while p3 was still counted as owing an action, so
  // this would spin for all 60 steps without ever reaching settlement.
  for (let step = 0; step < 60; step += 1) {
    // Once the first hand settles, p3 is legitimately part of hand #2 onward (they were
    // in table.players when it was dealt) -- stop here, which is exactly the point this
    // test needs to prove: the *hand already in progress* must exclude them, not every
    // hand from now on.
    if (poker.getHandHistory('table-midjoin').length >= 1) break;
    const table = poker.getTable('table-midjoin');
    const turn = table.currentTurn;
    if (!turn) break;
    assert.notEqual(turn, 'p3', 'the newly-joined player must never be given a turn in the hand already in progress when they joined');
    const actor = table.players.find((p) => p.id === turn);
    if (!actor) break;
    const toCall = table.currentBet - actor.streetContribution;
    poker.applyPlayerAction('table-midjoin', turn, toCall > 0 ? 'call' : 'check', 0);
  }

  // With 2 players continuously checking/calling, a healthy table settles and redeals
  // repeatedly within 60 steps -- the fixed bug made it settle exactly zero times.
  assert.ok(poker.getHandHistory('table-midjoin').length >= 1, 'hand should have settled despite the mid-hand join');

  // The joining player must be dealt into the *next* hand -- that's the whole point of
  // letting them join early rather than blocking the seat until the hand ends.
  assert.equal(poker.getHoleCardsFor('table-midjoin', 'p3').length, 2);
});

test('cashing out returns the remaining stack to the wallet and frees the seat', () => {
  const wallet = new WalletService();
  const poker = new PokerService(undefined, wallet);
  wallet.ensureWallet('p1');
  wallet.ensureWallet('p2');
  const before = wallet.getWallet('p1').availableChips;

  poker.createCashTable('table-cashout', 'micro-1', [
    { id: 'p1', name: 'Ada', stack: 100 },
    { id: 'p2', name: 'Linus', stack: 100 },
  ]);

  const seatedStack = poker.getTable('table-cashout').players.find((e) => e.id === 'p1')!.stack;
  const result = poker.cashOutPlayer('table-cashout', 'p1');

  assert.equal(result.amount, seatedStack);
  assert.equal(wallet.getWallet('p1').availableChips, before + seatedStack);
  assert.equal(poker.isPlayerSeated('table-cashout', 'p1'), false);
  assert.throws(() => poker.cashOutPlayer('table-cashout', 'p1'), /not seated/);
});

test('quotes transparent transaction fees outside poker pots', () => {
  const payment = new PaymentService();
  const instantQuote = payment.quoteDeposit(100, 'instant');
  const standardQuote = payment.quoteDeposit(100, 'standard');

  assert.equal(instantQuote.baseAmount, 100);
  assert.equal(instantQuote.mode, 'instant');
  assert.ok(instantQuote.totalCharged > instantQuote.baseAmount);
  assert.ok(instantQuote.serviceFee > standardQuote.serviceFee);
});

test('blocks real-money mode through compliance placeholders', () => {
  const compliance = new ComplianceService();
  const decision = compliance.getDecision('acct-1');

  assert.equal(decision.canPlayRealMoney, false);
  assert.ok(decision.reasons.length > 0);
});

test('records wallet ledger entries immutably when winnings are credited', () => {
  const walletService = new WalletService();
  walletService.ensureWallet('acct-win');
  const wallet = walletService.creditWinnings('acct-win', 125, 'table-1');

  assert.equal(wallet.ledger.length, 1);
  assert.equal(wallet.ledger[0].type, 'win');
  assert.equal(wallet.ledger[0].amount, 125);
});

test('creates hand verification records with deck commitment and action timeline', () => {
  const poker = new PokerService();
  poker.createCashTable('table-verify', 'micro-1', [
    { id: 'p1', name: 'Ada', stack: 1000 },
    { id: 'p2', name: 'Linus', stack: 1000 },
  ]);

  poker.applyPlayerAction('table-verify', 'p1', 'raise', 20);
  poker.applyPlayerAction('table-verify', 'p2', 'call', 20);
  poker.advanceStreet('table-verify');
  poker.advanceStreet('table-verify');
  poker.advanceStreet('table-verify');

  const settled = poker.settleHand('table-verify');
  const verification = poker.getHandVerification(settled.handId);

  assert.equal(verification.tableId, 'table-verify');
  assert.equal(typeof verification.deckCommitment, 'string');
  assert.ok(verification.deckCommitment.length > 20);
  assert.equal(verification.deckGeneration.source, 'server-crypto-rng');
  assert.ok(verification.actions.length >= 2);
  assert.equal(verification.result.pot, settled.totalPot);
});

test('supports replay retrieval for spectator and post-hand review flows', () => {
  const poker = new PokerService();
  poker.createCashTable('table-replay', 'micro-1', [
    { id: 'p1', name: 'Ada', stack: 1000 },
    { id: 'p2', name: 'Linus', stack: 1000 },
  ]);

  poker.applyPlayerAction('table-replay', 'p1', 'raise', 10);
  poker.applyPlayerAction('table-replay', 'p2', 'call', 10);
  const settled = poker.settleHand('table-replay');
  const replay = poker.getHandReplay('table-replay', settled.handId);

  assert.equal(replay.tableId, 'table-replay');
  assert.equal(replay.handId, settled.handId);
  assert.ok(replay.events.length >= 3);
});

test('maintains verified-human trust profiles and anti-cheat risk tracking', () => {
  const trust = new TrustService();
  trust.ensurePlayer('p-trust');
  trust.markVerifiedHuman('p-trust');
  trust.setSecurityVerificationStatus('p-trust', 'enhanced');
  trust.recordAntiCheatSignal({
    userId: 'p-trust',
    category: 'suspicious-timing',
    severity: 'low',
    detail: 'Disconnected repeatedly before turn action timeout.',
  });

  const snapshot = trust.getPlayerTrust('p-trust');
  assert.equal(snapshot.verifiedHuman, true);
  assert.equal(snapshot.securityVerificationStatus, 'enhanced');
  assert.ok(snapshot.trustScore > 60);
  assert.equal(snapshot.noUndisclosedAiPlayers, true);
});

test('creates social progression and achievement milestones from tracked sessions', () => {
  const community = new CommunityService();
  community.ensureProfile('p-social', 'Nova');
  community.recordSessionSummary('p-social', {
    durationMinutes: 42,
    handsPlayed: 180,
    netProfit: 86,
    biggestPot: 220,
  });

  const profile = community.getProfile('p-social');
  const tracker = community.getSessionTracker('p-social');

  assert.equal(profile.sessionsCompleted, 1);
  assert.equal(profile.level >= 2, true);
  assert.equal(tracker.totalSessions, 1);
  assert.equal(tracker.totalHands, 180);
  assert.equal(profile.achievements.some((entry) => entry.id === 'first-hand'), true);
});

test('generates ai coaching review summaries and hand advice', () => {
  const coach = new CoachService();
  coach.recordAction({ userId: 'p-coach', type: 'call', street: 'river' });
  coach.recordAction({ userId: 'p-coach', type: 'call', street: 'river' });
  coach.recordAction({ userId: 'p-coach', type: 'call', street: 'river' });
  coach.recordAction({ userId: 'p-coach', type: 'fold', street: 'preflop' });

  const review = coach.generateSessionReview('p-coach');

  assert.equal(review.userId, 'p-coach');
  assert.ok(review.summary.length > 0);
  assert.ok(review.biggestMistakes.length > 0);
  assert.ok(review.premium.personalizedPlan.length > 0);
});

test('tracks qualifying high hands with non-cash rewards and shareable highlights', () => {
  const highHands = new HighHandService();
  const entry = highHands.recordHighHand({
    handId: 'hh-1',
    playerId: 'p1',
    playerName: 'Ada',
    handName: 'royal flush',
    achievedAt: new Date().toISOString(),
    tableId: 'cash-aurora',
    cardsShown: ['Ah', 'Kh'],
    communityCards: ['Qh', 'Jh', 'Th', '2c', '3d'],
    replayEvents: [],
  });

  assert.ok(entry);
  assert.equal(entry?.rewards.tournamentTickets.length, 1);
  assert.equal(entry?.rewards.satelliteEntries.length, 1);
  assert.equal(entry?.rewards.clubRankingPoints, 500);

  const highlight = highHands.getHighlight('hh-1');
  assert.equal(highlight.achievementEarned, 'Royal Flush Champion');
  assert.ok(highlight.shareText.includes('Royal Flush'));
});

test('persists auth sessions across service restarts', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'truestack-sessions-'));
  const storagePath = join(tempDir, 'auth-sessions.json');

  try {
    const first = new SessionService({ authStoragePath: storagePath });
    const issued = first.issueAuthToken('p1');

    const second = new SessionService({ authStoragePath: storagePath });
    const restored = second.resolveAuthToken(issued.token);

    assert.ok(restored);
    assert.equal(restored?.userId, 'p1');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
