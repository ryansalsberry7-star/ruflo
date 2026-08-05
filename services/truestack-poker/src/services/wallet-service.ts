import { randomUUID } from 'node:crypto';
import type { LedgerEntry, WalletState } from '../wallet.js';
import { applyLedgerEntry, createWallet } from '../wallet.js';

export class WalletService {
  private readonly wallets = new Map<string, WalletState>();

  ensureWallet(accountId: string): WalletState {
    const existing = this.wallets.get(accountId);
    if (existing) return existing;
    const created = createWallet(accountId);
    this.wallets.set(accountId, created);
    return created;
  }

  getWallet(accountId: string): WalletState {
    return this.ensureWallet(accountId);
  }

  record(
    accountId: string,
    type: LedgerEntry['type'],
    amount: number,
    metadata?: Record<string, unknown>
  ): WalletState {
    const wallet = this.ensureWallet(accountId);
    const entry: LedgerEntry = {
      id: randomUUID(),
      accountId,
      type,
      amount,
      currency: 'USD',
      metadata,
      createdAt: new Date().toISOString(),
    };

    const nextWallet = applyLedgerEntry(wallet, entry);
    this.wallets.set(accountId, nextWallet);
    return nextWallet;
  }

  transferForBuyIn(accountId: string, amount: number, tableId: string): WalletState {
    const buyIn = Math.abs(amount);
    const wallet = this.ensureWallet(accountId);
    if (buyIn > wallet.availableChips) {
      throw new Error('Insufficient wallet balance for requested buy-in.');
    }
    return this.record(accountId, 'buy-in', -buyIn, { tableId });
  }

  creditWinnings(accountId: string, amount: number, tableId: string): WalletState {
    return this.record(accountId, 'win', Math.abs(amount), { tableId });
  }
}
