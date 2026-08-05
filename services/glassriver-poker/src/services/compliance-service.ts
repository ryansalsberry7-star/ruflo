export interface ComplianceDecision {
  accountId: string;
  canPlayRealMoney: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  reasons: string[];
}

export interface ResponsibleGamingProfile {
  accountId: string;
  maxDailyDeposit: number;
  maxSessionMinutes: number;
  selfExcluded: boolean;
}

export class ComplianceService {
  private readonly profiles = new Map<string, ResponsibleGamingProfile>();

  getDecision(accountId: string): ComplianceDecision {
    const profile = this.getResponsibleGamingProfile(accountId);
    const reasons: string[] = [];

    if (profile.selfExcluded) {
      reasons.push('Account is self-excluded from gameplay.');
    }

    return {
      accountId,
      canPlayRealMoney: false,
      canDeposit: !profile.selfExcluded,
      canWithdraw: !profile.selfExcluded,
      reasons: reasons.length > 0 ? reasons : ['Real-money mode is not enabled in this environment.'],
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

  setSelfExclusion(accountId: string, enabled: boolean): ResponsibleGamingProfile {
    const profile = this.getResponsibleGamingProfile(accountId);
    const next = { ...profile, selfExcluded: enabled };
    this.profiles.set(accountId, next);
    return next;
  }
}
