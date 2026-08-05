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

  poker.applyPlayerAction('table-zero-rake', 'p1', 'bet', 10);
  poker.applyPlayerAction('table-zero-rake', 'p2', 'call', 10);

  const settled = poker.settleHand('table-zero-rake');
  const payoutTotal = settled.payouts.reduce((sum, entry) => sum + entry.amount, 0);

  assert.equal(settled.rakeTaken, 0);
  assert.equal(settled.zeroRakePolicy.rakePercent, 0);
  assert.equal(Number(payoutTotal.toFixed(2)), Number(settled.totalPot.toFixed(2)));
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

  poker.applyPlayerAction('table-verify', 'p1', 'bet', 20);
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

  poker.applyPlayerAction('table-replay', 'p1', 'bet', 10);
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
