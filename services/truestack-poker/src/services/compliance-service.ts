import type { RegionalGatingService } from './regional-gating-service.js';
import {
  UNVERIFIED_LOCATION,
  UnverifiedLocationVerifier,
  type LocationEvidence,
  type LocationVerifier,
  type VerifiedLocation,
} from './location-verifier.js';

export type KycStatus = 'unstarted' | 'pending' | 'verified' | 'rejected';

export interface KycProfile {
  accountId: string;
  status: KycStatus;
  fullName: string | null;
  dateOfBirth: string | null;
  jurisdiction: string | null;
  documentType: 'passport' | 'drivers-license' | 'national-id' | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface ResponsibleGamingProfile {
  accountId: string;
  maxDailyDeposit: number;
  maxSessionMinutes: number;
  selfExcluded: boolean;
}

export interface ComplianceContext {
  /**
   * Where the player was confirmed to physically be, as produced by a LocationVerifier.
   * This is deliberately not a plain string: a raw jurisdiction is a client claim, and
   * accepting one here is what let spoofed locations authorize real-money play. There is
   * no fallback to the KYC jurisdiction either -- that records where an ID was issued,
   * not where the player is sitting right now.
   */
  location?: VerifiedLocation | null;
  /** Optional deposit amount, used to evaluate remaining daily deposit headroom. */
  amount?: number;
}

export interface ComplianceDecision {
  accountId: string;
  canPlayRealMoney: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  kycStatus: KycStatus;
  jurisdiction: string | null;
  /** True only when a LocationVerifier confirmed physical presence for this decision. */
  locationVerified: boolean;
  /** Which provider established the location, recorded for the compliance audit trail. */
  locationSource: string;
  realMoneyEnabled: boolean;
  remainingDailyDeposit: number;
  reasons: string[];
}

export interface ComplianceServiceOptions {
  realMoneyEnabled?: boolean;
  regionalGating?: RegionalGatingService;
  minAgeYears?: number;
  /** Defaults to UnverifiedLocationVerifier, which fails closed. */
  locationVerifier?: LocationVerifier;
}

interface DailyDepositRecord {
  date: string;
  total: number;
}

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function ageInYears(dateOfBirth: string, now = new Date()): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export class ComplianceService {
  private readonly profiles = new Map<string, ResponsibleGamingProfile>();
  private readonly kycProfiles = new Map<string, KycProfile>();
  private readonly dailyDeposits = new Map<string, DailyDepositRecord>();
  private readonly realMoneyEnabled: boolean;
  private readonly regionalGating: RegionalGatingService | null;
  private readonly minAgeYears: number;
  private readonly locationVerifier: LocationVerifier;

  constructor(options: ComplianceServiceOptions = {}) {
    this.realMoneyEnabled = options.realMoneyEnabled ?? false;
    this.regionalGating = options.regionalGating ?? null;
    this.minAgeYears = options.minAgeYears ?? 21;
    this.locationVerifier = options.locationVerifier ?? new UnverifiedLocationVerifier();
  }

  isRealMoneyEnabled(): boolean {
    return this.realMoneyEnabled;
  }

  getLocationVerifierId(): string {
    return this.locationVerifier.id;
  }

  /**
   * Turn raw request evidence into a VerifiedLocation. Call this at the HTTP boundary
   * and pass the result into getDecision -- never hand getDecision a client-supplied
   * jurisdiction string.
   */
  async verifyLocation(evidence: LocationEvidence): Promise<VerifiedLocation> {
    return await this.locationVerifier.verify(evidence);
  }

  getKycProfile(accountId: string): KycProfile {
    const existing = this.kycProfiles.get(accountId);
    if (existing) return existing;

    const created: KycProfile = {
      accountId,
      status: 'unstarted',
      fullName: null,
      dateOfBirth: null,
      jurisdiction: null,
      documentType: null,
      submittedAt: null,
      reviewedAt: null,
      rejectionReason: null,
    };
    this.kycProfiles.set(accountId, created);
    return created;
  }

  submitKyc(
    accountId: string,
    input: {
      fullName: string;
      dateOfBirth: string;
      jurisdiction: string;
      documentType: 'passport' | 'drivers-license' | 'national-id';
    }
  ): KycProfile {
    const next: KycProfile = {
      accountId,
      status: 'pending',
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      jurisdiction: input.jurisdiction.trim().toUpperCase(),
      documentType: input.documentType,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      rejectionReason: null,
    };
    this.kycProfiles.set(accountId, next);
    return next;
  }

  resolveKyc(accountId: string, outcome: 'verified' | 'rejected', rejectionReason?: string): KycProfile {
    const existing = this.getKycProfile(accountId);
    const next: KycProfile = {
      ...existing,
      status: outcome,
      reviewedAt: new Date().toISOString(),
      rejectionReason: outcome === 'rejected' ? rejectionReason ?? 'KYC verification was not approved.' : null,
    };
    this.kycProfiles.set(accountId, next);
    return next;
  }

  recordDeposit(accountId: string, amount: number, now = new Date()): void {
    const key = todayKey(now);
    const record = this.dailyDeposits.get(accountId);
    if (!record || record.date !== key) {
      this.dailyDeposits.set(accountId, { date: key, total: amount });
      return;
    }
    this.dailyDeposits.set(accountId, { date: key, total: record.total + amount });
  }

  depositedToday(accountId: string, now = new Date()): number {
    const record = this.dailyDeposits.get(accountId);
    if (!record || record.date !== todayKey(now)) return 0;
    return record.total;
  }

  remainingDailyDeposit(accountId: string, now = new Date()): number {
    const profile = this.getResponsibleGamingProfile(accountId);
    return Math.max(0, profile.maxDailyDeposit - this.depositedToday(accountId, now));
  }

  getDecision(accountId: string, context: ComplianceContext = {}): ComplianceDecision {
    const profile = this.getResponsibleGamingProfile(accountId);
    const kyc = this.getKycProfile(accountId);
    const location = context.location ?? UNVERIFIED_LOCATION;
    // Only a verifier-confirmed jurisdiction counts. An unverified result carries no
    // jurisdiction at all, so it can never match the regional allowlist below.
    const resolvedJurisdiction = location.verified ? location.jurisdiction : null;
    const remainingDailyDeposit = this.remainingDailyDeposit(accountId);
    const reasons: string[] = [];

    if (!this.realMoneyEnabled) {
      reasons.push('Real-money mode is not enabled in this environment.');
      return {
        accountId,
        canPlayRealMoney: false,
        canDeposit: false,
        canWithdraw: false,
        kycStatus: kyc.status,
        jurisdiction: resolvedJurisdiction,
        locationVerified: location.verified,
        locationSource: location.source,
        realMoneyEnabled: false,
        remainingDailyDeposit,
        reasons,
      };
    }

    if (!location.verified) {
      reasons.push(location.reason);
    }

    if (profile.selfExcluded) {
      reasons.push('Account is self-excluded from gameplay.');
    }

    if (kyc.status !== 'verified') {
      reasons.push(`Identity verification (KYC) is ${kyc.status}. Verification is required for real-money play.`);
    }

    const regionDecision = this.regionalGating?.evaluate(resolvedJurisdiction) ?? null;
    if (!regionDecision || !regionDecision.realMoneyAllowed) {
      reasons.push(
        regionDecision?.reason ?? 'Regional gating is not configured. Real-money play is blocked by default.'
      );
    }

    if (kyc.status === 'verified' && kyc.dateOfBirth) {
      const age = ageInYears(kyc.dateOfBirth);
      if (age === null) {
        reasons.push('Date of birth on file is invalid.');
      } else if (age < this.minAgeYears) {
        reasons.push(`Account holder must be at least ${this.minAgeYears} years old.`);
      }
    }

    const kycVerified = kyc.status === 'verified';
    const regionAllowed = (regionDecision?.realMoneyAllowed ?? false) && location.verified;
    const ageOk = !kyc.dateOfBirth || (ageInYears(kyc.dateOfBirth) ?? 0) >= this.minAgeYears;
    const notExcluded = !profile.selfExcluded;

    const baseEligible = notExcluded && kycVerified && ageOk;
    const canPlayRealMoney = baseEligible && regionAllowed;
    const canDeposit = canPlayRealMoney && remainingDailyDeposit > 0;
    // Withdrawals skip the in-region check so a verified player can cash out while
    // traveling -- returning their own money is not placing a wager.
    const canWithdraw = notExcluded && kycVerified && ageOk;

    if (canDeposit && typeof context.amount === 'number' && context.amount > remainingDailyDeposit) {
      reasons.push('Requested deposit exceeds the remaining daily deposit limit.');
    }

    return {
      accountId,
      canPlayRealMoney,
      canDeposit,
      canWithdraw,
      kycStatus: kyc.status,
      jurisdiction: resolvedJurisdiction,
      locationVerified: location.verified,
      locationSource: location.source,
      realMoneyEnabled: true,
      remainingDailyDeposit,
      reasons: reasons.length > 0 ? reasons : ['All compliance checks passed.'],
    };
  }

  getResponsibleGamingProfile(accountId: string): ResponsibleGamingProfile {
    const existing = this.profiles.get(accountId);
    if (existing) return existing;

    const created: ResponsibleGamingProfile = {
      accountId,
      maxDailyDeposit: 500,
      maxSessionMinutes: 180,
      selfExcluded: false,
    };
    this.profiles.set(accountId, created);
    return created;
  }

  setResponsibleGamingLimits(
    accountId: string,
    limits: { maxDailyDeposit?: number; maxSessionMinutes?: number }
  ): ResponsibleGamingProfile {
    const profile = this.getResponsibleGamingProfile(accountId);
    const next: ResponsibleGamingProfile = {
      ...profile,
      maxDailyDeposit:
        typeof limits.maxDailyDeposit === 'number' && limits.maxDailyDeposit >= 0
          ? limits.maxDailyDeposit
          : profile.maxDailyDeposit,
      maxSessionMinutes:
        typeof limits.maxSessionMinutes === 'number' && limits.maxSessionMinutes >= 0
          ? limits.maxSessionMinutes
          : profile.maxSessionMinutes,
    };
    this.profiles.set(accountId, next);
    return next;
  }

  setSelfExclusion(accountId: string, enabled: boolean): ResponsibleGamingProfile {
    const profile = this.getResponsibleGamingProfile(accountId);
    const next = { ...profile, selfExcluded: enabled };
    this.profiles.set(accountId, next);
    return next;
  }
}
