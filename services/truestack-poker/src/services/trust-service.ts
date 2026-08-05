import { loadJsonFile, saveJsonFile } from './persistence.js';

export type SecurityVerificationStatus = 'unverified' | 'email-verified' | 'id-verified' | 'enhanced';

export type AntiCheatSignalCategory =
  | 'bot-pattern'
  | 'multi-account'
  | 'collusion'
  | 'suspicious-timing'
  | 'chip-dumping';

export type AntiCheatSignalSeverity = 'low' | 'medium' | 'high';

export interface AntiCheatSignal {
  userId: string;
  category: AntiCheatSignalCategory;
  severity: AntiCheatSignalSeverity;
  detail: string;
  at: string;
}

export interface PlayerTrustSnapshot {
  userId: string;
  verifiedHuman: boolean;
  verifiedHumanBadge: 'verified-human' | 'unverified';
  trustScore: number;
  accountCreatedAt: string;
  accountAgeDays: number;
  securityVerificationStatus: SecurityVerificationStatus;
  completedSessions: number;
  fairPlayStrikes: number;
  suspiciousSignals: number;
  reputationTag: 'trusted-player' | 'watchlisted' | 'under-review';
  noUndisclosedAiPlayers: true;
}

export interface CollusionAssessment {
  pair: [string, string];
  riskScore: number;
  status: 'clear' | 'monitor' | 'high-risk';
  reasons: string[];
  assessedAt: string;
}

interface InternalTrustRecord {
  userId: string;
  accountCreatedAt: string;
  trustScore: number;
  verifiedHuman: boolean;
  securityVerificationStatus: SecurityVerificationStatus;
  completedSessions: number;
  fairPlayStrikes: number;
  suspiciousSignals: number;
}

interface TrustServiceOptions {
  storagePath?: string | null;
}

export class TrustService {
  private readonly players = new Map<string, InternalTrustRecord>();
  private readonly signals = new Map<string, AntiCheatSignal[]>();
  private readonly collusionAssessments = new Map<string, CollusionAssessment>();

  constructor(private readonly options: TrustServiceOptions = {}) {
    const persisted = loadJsonFile<InternalTrustRecord[]>(this.options.storagePath);
    for (const record of persisted ?? []) {
      this.players.set(record.userId, record);
    }
  }

  ensurePlayer(userId: string): PlayerTrustSnapshot {
    const existing = this.players.get(userId);
    if (existing) return this.toSnapshot(existing);

    const created: InternalTrustRecord = {
      userId,
      accountCreatedAt: new Date().toISOString(),
      trustScore: 72,
      verifiedHuman: false,
      securityVerificationStatus: 'unverified',
      completedSessions: 0,
      fairPlayStrikes: 0,
      suspiciousSignals: 0,
    };

    this.players.set(userId, created);
    this.persist();
    return this.toSnapshot(created);
  }

  getPlayerTrust(userId: string): PlayerTrustSnapshot {
    return this.ensurePlayer(userId);
  }

  markVerifiedHuman(userId: string): PlayerTrustSnapshot {
    const existing = this.ensureInternal(userId);
    const next: InternalTrustRecord = {
      ...existing,
      verifiedHuman: true,
      securityVerificationStatus:
        existing.securityVerificationStatus === 'unverified' ? 'email-verified' : existing.securityVerificationStatus,
      trustScore: Math.min(99, existing.trustScore + 10),
    };

    this.players.set(userId, next);
    this.persist();
    return this.toSnapshot(next);
  }

  setSecurityVerificationStatus(userId: string, status: SecurityVerificationStatus): PlayerTrustSnapshot {
    const existing = this.ensureInternal(userId);
    const trustBoost = status === 'enhanced' ? 6 : status === 'id-verified' ? 4 : status === 'email-verified' ? 2 : -4;

    const next: InternalTrustRecord = {
      ...existing,
      securityVerificationStatus: status,
      trustScore: this.clampTrust(existing.trustScore + trustBoost),
      verifiedHuman: existing.verifiedHuman || status === 'id-verified' || status === 'enhanced',
    };

    this.players.set(userId, next);
    this.persist();
    return this.toSnapshot(next);
  }

  recordCompletedSession(userId: string, cleanSession = true): PlayerTrustSnapshot {
    const existing = this.ensureInternal(userId);
    const trustDelta = cleanSession ? 1 : -2;

    const next: InternalTrustRecord = {
      ...existing,
      completedSessions: existing.completedSessions + 1,
      trustScore: this.clampTrust(existing.trustScore + trustDelta),
    };

    this.players.set(userId, next);
    this.persist();
    return this.toSnapshot(next);
  }

  recordAntiCheatSignal(input: Omit<AntiCheatSignal, 'at'>): PlayerTrustSnapshot {
    const existing = this.ensureInternal(input.userId);
    const at = new Date().toISOString();
    const signal: AntiCheatSignal = { ...input, at };
    const tracked = this.signals.get(input.userId) ?? [];
    this.signals.set(input.userId, [...tracked, signal]);

    const severityPenalty = input.severity === 'high' ? 12 : input.severity === 'medium' ? 7 : 3;

    const next: InternalTrustRecord = {
      ...existing,
      suspiciousSignals: existing.suspiciousSignals + 1,
      fairPlayStrikes: existing.fairPlayStrikes + (input.severity === 'high' ? 1 : 0),
      trustScore: this.clampTrust(existing.trustScore - severityPenalty),
    };

    this.players.set(input.userId, next);
    this.persist();
    return this.toSnapshot(next);
  }

  assessCollusion(input: {
    userA: string;
    userB: string;
    sharedTables: number;
    mirroredDecisionRate: number;
    chipTransferBias: number;
  }): CollusionAssessment {
    this.ensurePlayer(input.userA);
    this.ensurePlayer(input.userB);

    const behaviorScore = Math.min(100, Math.round(input.mirroredDecisionRate * 40 + input.chipTransferBias * 50 + input.sharedTables * 4));
    const status: CollusionAssessment['status'] = behaviorScore >= 75 ? 'high-risk' : behaviorScore >= 45 ? 'monitor' : 'clear';

    const reasons: string[] = [];
    if (input.sharedTables >= 8) reasons.push('Frequent repeated seating together.');
    if (input.mirroredDecisionRate >= 0.65) reasons.push('Highly mirrored betting decisions.');
    if (input.chipTransferBias >= 0.6) reasons.push('Asymmetric chip flow suggests chip-dumping risk.');
    if (reasons.length === 0) reasons.push('No significant collusion indicators detected.');

    const assessment: CollusionAssessment = {
      pair: [input.userA, input.userB],
      riskScore: behaviorScore,
      status,
      reasons,
      assessedAt: new Date().toISOString(),
    };

    const key = `${input.userA}:${input.userB}`;
    this.collusionAssessments.set(key, assessment);

    if (status === 'high-risk') {
      this.recordAntiCheatSignal({
        userId: input.userA,
        category: 'collusion',
        severity: 'high',
        detail: `Collusion risk flagged with ${input.userB}.`,
      });
      this.recordAntiCheatSignal({
        userId: input.userB,
        category: 'collusion',
        severity: 'high',
        detail: `Collusion risk flagged with ${input.userA}.`,
      });
    }

    return assessment;
  }

  listFlaggedPlayers(minSignals = 2): Array<PlayerTrustSnapshot & { signals: AntiCheatSignal[] }> {
    return Array.from(this.players.values())
      .filter((entry) => entry.suspiciousSignals >= minSignals || entry.trustScore <= 45)
      .map((entry) => ({
        ...this.toSnapshot(entry),
        signals: this.signals.get(entry.userId) ?? [],
      }))
      .sort((a, b) => a.trustScore - b.trustScore);
  }

  getTrustCenterOverview(): {
    promise: string;
    noUndisclosedAiPlayers: true;
    antiCheatArchitecture: string[];
    protections: string[];
  } {
    return {
      // States what the platform actually enforces. An absolute "no bots" claim is not
      // one any operator can guarantee, and it is not what the anti-cheat stack below
      // does -- it detects and acts on automated play rather than preventing it outright.
      promise: 'Zero rake. Every chip in the pot goes to players. Automated play is monitored and actioned.',
      noUndisclosedAiPlayers: true,
      antiCheatArchitecture: [
        'Server-side behavior fingerprinting',
        'Multi-account graph linking',
        'Collusion pair and ring monitoring',
        'Suspicious gameplay timing analysis',
      ],
      protections: [
        'All card generation and dealing is server-authoritative.',
        'Every completed hand can be replayed and verified.',
        'High-risk signals trigger trust score downgrades and manual review.',
      ],
    };
  }

  private ensureInternal(userId: string): InternalTrustRecord {
    this.ensurePlayer(userId);
    const record = this.players.get(userId);
    if (!record) throw new Error('Unable to initialize trust profile.');
    return record;
  }

  private toSnapshot(record: InternalTrustRecord): PlayerTrustSnapshot {
    const accountAgeDays = Math.max(0, Math.floor((Date.now() - Date.parse(record.accountCreatedAt)) / (1000 * 60 * 60 * 24)));

    return {
      userId: record.userId,
      verifiedHuman: record.verifiedHuman,
      verifiedHumanBadge: record.verifiedHuman ? 'verified-human' : 'unverified',
      trustScore: record.trustScore,
      accountCreatedAt: record.accountCreatedAt,
      accountAgeDays,
      securityVerificationStatus: record.securityVerificationStatus,
      completedSessions: record.completedSessions,
      fairPlayStrikes: record.fairPlayStrikes,
      suspiciousSignals: record.suspiciousSignals,
      reputationTag: record.trustScore < 45 ? 'under-review' : record.suspiciousSignals >= 3 ? 'watchlisted' : 'trusted-player',
      noUndisclosedAiPlayers: true,
    };
  }

  private clampTrust(score: number): number {
    return Math.max(0, Math.min(99, Math.round(score)));
  }

  private persist(): void {
    saveJsonFile(this.options.storagePath, Array.from(this.players.values()));
  }
}
