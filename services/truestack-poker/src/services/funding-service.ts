import type { WalletState } from '../wallet.js';
import type { ComplianceService } from './compliance-service.js';
import type { VerifiedLocation } from './location-verifier.js';
import type { PaymentService, PaymentTransaction } from './payment-service.js';
import type { WalletService } from './wallet-service.js';

export type FundingFailureCode =
  | 'invalid-amount'
  | 'compliance-blocked'
  | 'daily-limit-exceeded'
  | 'insufficient-funds'
  | 'payment-failed';

export interface FundingRequest {
  accountId: string;
  amount: number;
  mode?: 'instant' | 'standard';
  /** Verifier-confirmed presence. Omitted means unverified, which blocks deposits. */
  location?: VerifiedLocation | null;
}

export type FundingResult =
  | { ok: true; wallet: WalletState; transaction: PaymentTransaction }
  | { ok: false; code: FundingFailureCode; reasons: string[] };

/**
 * FundingService ties compliance gating to the payment rail and the wallet
 * ledger. Every real-money deposit/withdrawal passes KYC + regional + RG
 * checks before any money moves, and the wallet is only mutated after the
 * processor confirms.
 */
export class FundingService {
  constructor(
    private readonly wallet: WalletService,
    private readonly payment: PaymentService,
    private readonly compliance: ComplianceService
  ) {}

  async deposit(request: FundingRequest): Promise<FundingResult> {
    const amount = Number(request.amount);
    const mode = request.mode ?? 'standard';
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, code: 'invalid-amount', reasons: ['Deposit amount must be a positive number.'] };
    }

    const decision = this.compliance.getDecision(request.accountId, {
      location: request.location,
      amount,
    });
    if (!decision.canDeposit) {
      return { ok: false, code: 'compliance-blocked', reasons: decision.reasons };
    }
    if (amount > decision.remainingDailyDeposit) {
      return {
        ok: false,
        code: 'daily-limit-exceeded',
        reasons: [`Deposit exceeds the remaining daily limit of ${decision.remainingDailyDeposit}.`],
      };
    }

    const transaction = await this.payment.executeDeposit(request.accountId, amount, mode);
    if (transaction.status !== 'completed') {
      return { ok: false, code: 'payment-failed', reasons: ['The payment processor declined the deposit.'] };
    }

    this.compliance.recordDeposit(request.accountId, amount);
    const wallet = this.wallet.record(request.accountId, 'deposit', amount, {
      transactionId: transaction.id,
      providerRef: transaction.providerRef,
    });
    return { ok: true, wallet, transaction };
  }

  async withdraw(request: FundingRequest): Promise<FundingResult> {
    const amount = Number(request.amount);
    const mode = request.mode ?? 'standard';
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, code: 'invalid-amount', reasons: ['Withdrawal amount must be a positive number.'] };
    }

    const decision = this.compliance.getDecision(request.accountId, { location: request.location });
    if (!decision.canWithdraw) {
      return { ok: false, code: 'compliance-blocked', reasons: decision.reasons };
    }

    const current = this.wallet.getWallet(request.accountId);
    if (amount > current.availableChips) {
      return { ok: false, code: 'insufficient-funds', reasons: ['Withdrawal exceeds the available wallet balance.'] };
    }

    const transaction = await this.payment.executeWithdrawal(request.accountId, amount, mode);
    if (transaction.status !== 'completed') {
      return { ok: false, code: 'payment-failed', reasons: ['The payment processor declined the withdrawal.'] };
    }

    const wallet = this.wallet.record(request.accountId, 'withdrawal', -amount, {
      transactionId: transaction.id,
      providerRef: transaction.providerRef,
    });
    return { ok: true, wallet, transaction };
  }
}
