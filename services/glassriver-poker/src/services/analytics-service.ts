export interface SessionStat {
  accountId: string;
  handsPlayed: number;
  handsPerHour: number;
  biggestPot: number;
  winRate: number;
  updatedAt: string;
}

export class AnalyticsService {
  private readonly sessionStats = new Map<string, SessionStat>();

  trackHand(accountId: string, handDurationSeconds: number, pot: number, won: boolean): SessionStat {
    const existing =
      this.sessionStats.get(accountId) ??
      ({
        accountId,
        handsPlayed: 0,
        handsPerHour: 0,
        biggestPot: 0,
        winRate: 0,
        updatedAt: new Date().toISOString(),
      } satisfies SessionStat);

    const handsPlayed = existing.handsPlayed + 1;
    const handsPerHour = Number((3600 / Math.max(handDurationSeconds, 1)).toFixed(2));
    const wins = Math.round((existing.winRate / 100) * existing.handsPlayed) + (won ? 1 : 0);
    const winRate = Number(((wins / handsPlayed) * 100).toFixed(2));

    const next: SessionStat = {
      accountId,
      handsPlayed,
      handsPerHour,
      biggestPot: Math.max(existing.biggestPot, pot),
      winRate,
      updatedAt: new Date().toISOString(),
    };

    this.sessionStats.set(accountId, next);
    return next;
  }

  getSessionStat(accountId: string): SessionStat | null {
    return this.sessionStats.get(accountId) ?? null;
  }
}
