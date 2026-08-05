export type LedgerEntryType = 'deposit' | 'withdrawal' | 'buy-in' | 'win' | 'bonus' | 'purchase';

export interface LedgerEntry {
  id: string;
  accountId: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WalletState {
  accountId: string;
  balance: number;
  availableChips: number;
  tournamentTickets: number;
  bonusBalance: number;
  ledger: LedgerEntry[];
}

export function createWallet(accountId: string): WalletState {
  return {
    accountId,
    balance: 1000,
    availableChips: 1000,
    tournamentTickets: 5,
    bonusBalance: 50,
    ledger: [],
  };
}

export function applyLedgerEntry(wallet: WalletState, entry: LedgerEntry): WalletState {
  const nextLedger = [...wallet.ledger, entry];
  const nextBalance = wallet.balance + entry.amount;
  return {
    ...wallet,
    balance: nextBalance,
    availableChips: wallet.availableChips + entry.amount,
    ledger: nextLedger,
  };
}

export function getLedgerSummary(wallet: WalletState) {
  return {
    totalEntries: wallet.ledger.length,
    totalBalance: wallet.balance,
    totalAvailableChips: wallet.availableChips,
  };
}
