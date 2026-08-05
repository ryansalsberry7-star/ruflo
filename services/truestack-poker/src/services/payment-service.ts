import { randomUUID } from 'node:crypto';
import type { TransparentFeeBreakdown } from '../contracts.js';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'flagged';

export interface PaymentTransaction {
  id: string;
  accountId: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  fee: number;
  provider: string;
  mode: 'instant' | 'standard';
  status: PaymentStatus;
  providerRef: string | null;
  createdAt: string;
}

export interface PaymentProcessorResult {
  ok: boolean;
  providerRef: string;
  error?: string;
}

/**
 * Pluggable payment rail. Swap the mock for a real PSP (Stripe, Circle, a
 * sweepstakes redemption provider, etc.) without touching the funding flow.
 */
export interface PaymentProcessor {
  readonly id: string;
  charge(request: { accountId: string; amount: number; reference: string }): Promise<PaymentProcessorResult>;
  payout(request: { accountId: string; amount: number; reference: string }): Promise<PaymentProcessorResult>;
}

/** Deterministic dev/test processor. Never contacts a real network or holds credentials. */
export class MockPaymentProcessor implements PaymentProcessor {
  readonly id = 'mock-processor';

  async charge(request: { accountId: string; amount: number; reference: string }): Promise<PaymentProcessorResult> {
    return { ok: true, providerRef: `mock-charge-${request.reference}` };
  }

  async payout(request: { accountId: string; amount: number; reference: string }): Promise<PaymentProcessorResult> {
    return { ok: true, providerRef: `mock-payout-${request.reference}` };
  }
}

export class PaymentService {
  private readonly transactions = new Map<string, PaymentTransaction>();
  private readonly processor: PaymentProcessor;

  constructor(processor: PaymentProcessor = new MockPaymentProcessor()) {
    this.processor = processor;
  }

  getProviderId(): string {
    return this.processor.id;
  }

  quoteDeposit(amount: number, mode: 'instant' | 'standard'): TransparentFeeBreakdown {
    const serviceFeeRate = mode === 'instant' ? 0.035 : 0.01;
    const providerPassThrough = mode === 'instant' ? 0.35 : 0.15;
    const serviceFee = Number((amount * serviceFeeRate).toFixed(2));
    const totalCharged = Number((amount + serviceFee + providerPassThrough).toFixed(2));

    return {
      baseAmount: amount,
      serviceFee,
      providerPassThrough,
      totalCharged,
      mode,
      feeLabel: mode === 'instant' ? 'Instant transfer service fee' : 'Standard processing fee',
    };
  }

  createTransaction(
    accountId: string,
    type: 'deposit' | 'withdrawal',
    amount: number,
    provider: string,
    mode: 'instant' | 'standard'
  ): PaymentTransaction {
    const quote = this.quoteDeposit(amount, mode);
    const tx: PaymentTransaction = {
      id: randomUUID(),
      accountId,
      type,
      amount,
      fee: quote.serviceFee + quote.providerPassThrough,
      provider,
      mode,
      status: 'pending',
      providerRef: null,
      createdAt: new Date().toISOString(),
    };
    this.transactions.set(tx.id, tx);
    return tx;
  }

  async executeDeposit(
    accountId: string,
    amount: number,
    mode: 'instant' | 'standard'
  ): Promise<PaymentTransaction> {
    const tx = this.createTransaction(accountId, 'deposit', amount, this.processor.id, mode);
    this.setStatus(tx.id, 'processing');
    const result = await this.processor.charge({ accountId, amount, reference: tx.id });
    return this.finalize(tx.id, result);
  }

  async executeWithdrawal(
    accountId: string,
    amount: number,
    mode: 'instant' | 'standard'
  ): Promise<PaymentTransaction> {
    const tx = this.createTransaction(accountId, 'withdrawal', amount, this.processor.id, mode);
    this.setStatus(tx.id, 'processing');
    const result = await this.processor.payout({ accountId, amount, reference: tx.id });
    return this.finalize(tx.id, result);
  }

  updateStatus(txId: string, status: PaymentStatus): PaymentTransaction {
    return this.setStatus(txId, status);
  }

  listTransactions(accountId: string): PaymentTransaction[] {
    return Array.from(this.transactions.values()).filter((entry) => entry.accountId === accountId);
  }

  private setStatus(txId: string, status: PaymentStatus): PaymentTransaction {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error('Transaction not found');
    const next = { ...tx, status };
    this.transactions.set(txId, next);
    return next;
  }

  private finalize(txId: string, result: PaymentProcessorResult): PaymentTransaction {
    const tx = this.transactions.get(txId);
    if (!tx) throw new Error('Transaction not found');
    const next: PaymentTransaction = {
      ...tx,
      status: result.ok ? 'completed' : 'failed',
      providerRef: result.providerRef,
    };
    this.transactions.set(txId, next);
    return next;
  }
}
