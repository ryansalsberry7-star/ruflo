import test from 'node:test';
import assert from 'node:assert/strict';
import { PokerService } from '../src/services/poker-service.js';
import { PaymentService } from '../src/services/payment-service.js';
import { ComplianceService } from '../src/services/compliance-service.js';
import { WalletService } from '../src/services/wallet-service.js';

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
