import type { HandVerificationRecord } from './dealer-service.js';

export type HighHandPeriod = 'day' | 'week' | 'month' | 'all-time';

export interface HighHandRewardPackage {
  tournamentTickets: string[];
  satelliteEntries: string[];
  cosmeticItems: string[];
  profileBadges: string[];
  achievementTitles: string[];
  clubRankingPoints: number;
}

export interface HighHandHighlight {
  handId: string;
  playerId: string;
  playerName: string;
  handName: string;
  tableId: string;
  achievedAt: string;
  cardsShown: string[];
  communityCards: string[];
  replayEvents: HandVerificationRecord['replay'];
  achievementEarned: string;
  shareText: string;
}

export interface HighHandEntry {
  handId: string;
  playerId: string;
  playerName: string;
  handName: string;
  handScore: number;
  achievedAt: string;
  tableId: string;
  points: number;
  rewards: HighHandRewardPackage;
  premiumOnly: boolean;
  highlight: HighHandHighlight;
}

export interface HighHandPremiumOverview {
  userId: string;
  proMember: boolean;
  dailyChallenges: string[];
  exclusiveLeaderboards: string[];
  specialTournaments: string[];
  premiumAchievementBadges: string[];
  historyTracking: boolean;
}

const DEFAULT_QUALIFYING_HANDS = ['royal flush', 'straight flush', 'four of a kind', 'full house', 'flush'] as const;

const HAND_SCORES: Record<string, number> = {
  'royal flush': 1000,
  'straight flush': 900,
  'four of a kind': 800,
  'full house': 700,
  flush: 600,
  straight: 500,
  'three of a kind': 400,
  'two pair': 300,
  pair: 200,
  'high card': 100,
};

export class HighHandService {
  private readonly entries: HighHandEntry[] = [];
  private readonly userHistory = new Map<string, HighHandEntry[]>();
  private readonly highlights = new Map<string, HighHandHighlight>();
  private readonly qualifyingHands = new Set<string>(DEFAULT_QUALIFYING_HANDS);

  seedDemoEntries(entries: HighHandEntry[]): void {
    for (const entry of entries) {
      this.storeEntry(entry);
    }
  }

  recordHighHand(input: {
    handId: string;
    playerId: string;
    playerName: string;
    handName: string;
    achievedAt: string;
    tableId: string;
    cardsShown: string[];
    communityCards: string[];
    replayEvents: HandVerificationRecord['replay'];
  }): HighHandEntry | null {
    const normalizedHand = input.handName.trim().toLowerCase();
    if (!this.qualifyingHands.has(normalizedHand)) return null;

    const points = this.scoreToPoints(normalizedHand);
    const rewards = this.buildRewards(normalizedHand);
    const entry: HighHandEntry = {
      handId: input.handId,
      playerId: input.playerId,
      playerName: input.playerName,
      handName: this.displayHandName(normalizedHand),
      handScore: HAND_SCORES[normalizedHand] ?? 0,
      achievedAt: input.achievedAt,
      tableId: input.tableId,
      points,
      rewards,
      premiumOnly: normalizedHand === 'royal flush' || normalizedHand === 'straight flush',
      highlight: {
        handId: input.handId,
        playerId: input.playerId,
        playerName: input.playerName,
        handName: this.displayHandName(normalizedHand),
        tableId: input.tableId,
        achievedAt: input.achievedAt,
        cardsShown: input.cardsShown,
        communityCards: input.communityCards,
        replayEvents: input.replayEvents,
        achievementEarned: rewards.achievementTitles[0] ?? 'High Hand Club',
        shareText: `${input.playerName} hit a ${this.displayHandName(normalizedHand)} at ${input.tableId} and earned ${points} High Hand Club points.`,
      },
    };

    this.storeEntry(entry);
    return entry;
  }

  getLeaderboards(): Record<'day' | 'week' | 'month' | 'allTime', HighHandEntry[]> {
    const now = Date.now();
    return {
      day: this.entriesForWindow(now - 1000 * 60 * 60 * 24),
      week: this.entriesForWindow(now - 1000 * 60 * 60 * 24 * 7),
      month: this.entriesForWindow(now - 1000 * 60 * 60 * 24 * 30),
      allTime: [...this.entries].sort(this.sortEntries).slice(0, 10),
    };
  }

  getUserHistory(userId: string): HighHandEntry[] {
    return (this.userHistory.get(userId) ?? []).slice().sort(this.sortEntries);
  }

  getHighlight(handId: string): HighHandHighlight {
    const highlight = this.highlights.get(handId);
    if (!highlight) throw new Error('High hand highlight not found');
    return highlight;
  }

  getPremiumOverview(userId: string): HighHandPremiumOverview {
    const history = this.getUserHistory(userId);
    return {
      userId,
      proMember: true,
      dailyChallenges: [
        'Make the daily qualifying board with a Full House or better.',
        'Capture 250 High Hand Club points in one session.',
      ],
      exclusiveLeaderboards: ['Pro Daily High Hand Sprint', 'Invite-only Royal Flush Ladder'],
      specialTournaments: ['High Hand Satellite Sundays', 'Straight Flush Shootout'],
      premiumAchievementBadges: history.length > 0 ? history.flatMap((entry) => entry.rewards.profileBadges).slice(0, 4) : ['Royal Flush Champion'],
      historyTracking: true,
    };
  }

  private entriesForWindow(startMs: number): HighHandEntry[] {
    return this.entries
      .filter((entry) => Date.parse(entry.achievedAt) >= startMs)
      .sort(this.sortEntries)
      .slice(0, 10);
  }

  private sortEntries(a: HighHandEntry, b: HighHandEntry): number {
    if (b.handScore !== a.handScore) return b.handScore - a.handScore;
    if (b.points !== a.points) return b.points - a.points;
    return Date.parse(b.achievedAt) - Date.parse(a.achievedAt);
  }

  private scoreToPoints(handName: string): number {
    const score = HAND_SCORES[handName] ?? 0;
    return Math.max(100, score);
  }

  private buildRewards(handName: string): HighHandRewardPackage {
    if (handName === 'royal flush') {
      return {
        tournamentTickets: ['GlassRiver Major Ticket'],
        satelliteEntries: ['VIP Satellite Seat'],
        cosmeticItems: ['onyx-gold-card-back', 'royal-table-theme'],
        profileBadges: ['royal-flush-champion'],
        achievementTitles: ['Royal Flush Champion'],
        clubRankingPoints: 500,
      };
    }

    if (handName === 'straight flush') {
      return {
        tournamentTickets: ['High Hand Championship Ticket'],
        satelliteEntries: ['Weekend Satellite Seat'],
        cosmeticItems: ['straight-flush-frame'],
        profileBadges: ['highest-hand-this-week'],
        achievementTitles: ['Highest Hand This Week'],
        clubRankingPoints: 300,
      };
    }

    if (handName === 'four of a kind') {
      return {
        tournamentTickets: ['Nightly Freezeout Ticket'],
        satelliteEntries: [],
        cosmeticItems: ['quad-aces-chip-design'],
        profileBadges: ['high-hand-hero'],
        achievementTitles: ['Four of a Kind Finisher'],
        clubRankingPoints: 180,
      };
    }

    return {
      tournamentTickets: ['Daily Deepstack Ticket'],
      satelliteEntries: [],
      cosmeticItems: ['full-house-badge'],
      profileBadges: ['high-hand-club'],
      achievementTitles: ['High Hand Club'],
      clubRankingPoints: 120,
    };
  }

  private displayHandName(handName: string): string {
    return handName
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private storeEntry(entry: HighHandEntry): void {
    this.entries.push(entry);
    this.highlights.set(entry.handId, entry.highlight);
    const byUser = this.userHistory.get(entry.playerId) ?? [];
    this.userHistory.set(entry.playerId, [...byUser, entry]);
  }
}
