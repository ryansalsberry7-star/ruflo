import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLedgerEntry, createWallet, getLedgerSummary } from '../src/wallet.js';

test('creates a wallet with virtual credits and ledger metadata', () => {
  const wallet = createWallet('acct-1');

  assert.equal(wallet.balance, 1000);
  assert.equal(wallet.availableChips, 1000);
  assert.equal(wallet.tournamentTickets, 5);
});

test('applies immutable ledger entries and updates summary', () => {
  const wallet = createWallet('acct-1');
  const updated = applyLedgerEntry(wallet, {
    id: 'entry-1',
    accountId: 'acct-1',
    type: 'buy-in',
    amount: -100,
    currency: 'USD',
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(updated.ledger.length, 1);
  assert.equal(updated.balance, 900);
  assert.deepEqual(getLedgerSummary(updated), {
    totalEntries: 1,
    totalBalance: 900,
    totalAvailableChips: 900,
  });
});
