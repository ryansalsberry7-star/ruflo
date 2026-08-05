export type SkillTier = 'beginner' | 'intermediate' | 'advanced' | 'pro';

const PLAYER_CHARACTER_IDS = [
  'river-fox',
  'night-owl',
  'gold-lion',
  'neon-panther',
  'storm-raven',
  'ember-wolf',
  'tide-koi',
  'lucky-hare',
] as const;

function normalizePlayerCharacter(value: string | undefined, seed: string): string {
  if (value && PLAYER_CHARACTER_IDS.includes(value as (typeof PLAYER_CHARACTER_IDS)[number])) {
    return value;
  }

  let hash = 11;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 131 + seed.charCodeAt(index)) >>> 0;
  }

  return PLAYER_CHARACTER_IDS[hash % PLAYER_CHARACTER_IDS.length];
}

export interface PlayerAchievement {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
  rarity: 'common' | 'rare' | 'legendary';
}

export interface TournamentHistoryEntry {
  tournamentId: string;
  placement: number;
  prize: number;
  playedAt: string;
}

export interface PlayerProfile {
  userId: string;
  username: string;
  favoriteGames: string[];
  handsPlayed: number;
  sessionsCompleted: number;
  winStreak: number;
  bestWinStreak: number;
  totalProfit: number;
  achievements: PlayerAchievement[];
  tournamentHistory: TournamentHistoryEntry[];
  follows: string[];
  online: boolean;
  level: number;
  badges: string[];
  sportsmanshipScore: number;
  reportsAgainst: number;
  reportsResolved: number;
  customization: {
    cardBack: string;
    tableTheme: string;
    dealerAvatar: string;
    profileFrame: string;
    chipDesign: string;
    playerCharacter: string;
  };
}

export interface PokerClub {
  id: string;
  name: string;
  ownerId: string;
  description: string;
  isPrivate: boolean;
  members: string[];
  createdAt: string;
  weeklyTournamentName: string;
}

export interface SessionTracker {
  userId: string;
  totalSessions: number;
  totalHands: number;
  bestSessionProfit: number;
  worstSessionProfit: number;
  averageSessionLengthMinutes: number;
  recentTrend: Array<{ at: string; net: number }>;
  biggestPots: number[];
}

export interface AcademyModule {
  id: string;
  level: SkillTier;
  title: string;
  summary: string;
  challenge: string;
}

interface SessionRecord {
  durationMinutes: number;
  handsPlayed: number;
  netProfit: number;
  biggestPot: number;
  completedAt: string;
}

export class CommunityService {
  private readonly profiles = new Map<string, PlayerProfile>();
  private readonly clubs = new Map<string, PokerClub>();
  private readonly sessions = new Map<string, SessionRecord[]>();

  ensureProfile(userId: string, username = userId): PlayerProfile {
    const existing = this.profiles.get(userId);
    if (existing) return existing;

    const profile: PlayerProfile = {
      userId,
      username,
      favoriteGames: ['No-Limit Holdem'],
      handsPlayed: 0,
      sessionsCompleted: 0,
      winStreak: 0,
      bestWinStreak: 0,
      totalProfit: 0,
      achievements: [],
      tournamentHistory: [],
      follows: [],
      online: false,
      level: 1,
      badges: ['new-player'],
      sportsmanshipScore: 90,
      reportsAgainst: 0,
      reportsResolved: 0,
      customization: {
        cardBack: 'classic-blue',
        tableTheme: 'truestack-noir',
        dealerAvatar: 'aurora-croupier',
        profileFrame: 'clean-silver',
        chipDesign: 'ceramic-black',
        playerCharacter: normalizePlayerCharacter(undefined, `${userId}:${username}`),
      },
    };

    this.profiles.set(userId, profile);
    return profile;
  }

  getProfile(userId: string): PlayerProfile {
    return this.ensureProfile(userId);
  }

  setOnlineStatus(userId: string, online: boolean): PlayerProfile {
    const profile = this.ensureProfile(userId);
    const next: PlayerProfile = { ...profile, online };
    this.profiles.set(userId, next);
    return next;
  }

  followPlayer(userId: string, targetUserId: string): PlayerProfile {
    const profile = this.ensureProfile(userId);
    this.ensureProfile(targetUserId);

    if (profile.follows.includes(targetUserId)) return profile;

    const next: PlayerProfile = {
      ...profile,
      follows: [...profile.follows, targetUserId],
    };

    this.profiles.set(userId, next);
    return next;
  }

  reportPlayer(targetUserId: string, resolved = false): PlayerProfile {
    const profile = this.ensureProfile(targetUserId);
    const next: PlayerProfile = {
      ...profile,
      reportsAgainst: profile.reportsAgainst + 1,
      reportsResolved: profile.reportsResolved + (resolved ? 1 : 0),
      sportsmanshipScore: Math.max(40, profile.sportsmanshipScore - (resolved ? 0 : 2)),
    };

    this.profiles.set(targetUserId, next);
    return next;
  }

  addTournamentResult(userId: string, result: Omit<TournamentHistoryEntry, 'playedAt'> & { playedAt?: string }): PlayerProfile {
    const profile = this.ensureProfile(userId);
    const entry: TournamentHistoryEntry = {
      ...result,
      playedAt: result.playedAt ?? new Date().toISOString(),
    };

    const next: PlayerProfile = {
      ...profile,
      tournamentHistory: [entry, ...profile.tournamentHistory].slice(0, 20),
    };

    this.profiles.set(userId, next);
    return next;
  }

  recordSessionSummary(userId: string, summary: { durationMinutes: number; handsPlayed: number; netProfit: number; biggestPot: number }): PlayerProfile {
    const profile = this.ensureProfile(userId);
    const records = this.sessions.get(userId) ?? [];
    const record: SessionRecord = {
      ...summary,
      completedAt: new Date().toISOString(),
    };

    this.sessions.set(userId, [...records, record].slice(-50));

    const won = summary.netProfit > 0;
    const updatedHands = profile.handsPlayed + summary.handsPlayed;
    const updatedLevel = Math.max(1, Math.floor(updatedHands / 150) + 1);
    const updatedWinStreak = won ? profile.winStreak + 1 : 0;

    let next: PlayerProfile = {
      ...profile,
      sessionsCompleted: profile.sessionsCompleted + 1,
      handsPlayed: updatedHands,
      totalProfit: Number((profile.totalProfit + summary.netProfit).toFixed(2)),
      winStreak: updatedWinStreak,
      bestWinStreak: Math.max(profile.bestWinStreak, updatedWinStreak),
      level: updatedLevel,
      badges: this.computeBadges(updatedLevel, profile.sportsmanshipScore),
    };

    next = this.applyAchievementMilestones(next);
    this.profiles.set(userId, next);
    return next;
  }

  listAchievements(userId: string): PlayerAchievement[] {
    return this.ensureProfile(userId).achievements;
  }

  setCustomization(
    userId: string,
    update: Partial<PlayerProfile['customization']>
  ): PlayerProfile {
    const profile = this.ensureProfile(userId);
    const next: PlayerProfile = {
      ...profile,
      customization: {
        ...profile.customization,
        ...update,
      },
    };

    this.profiles.set(userId, next);
    return next;
  }

  createClub(input: { ownerId: string; name: string; description: string; isPrivate?: boolean }): PokerClub {
    this.ensureProfile(input.ownerId);

    const id = `club-${Math.random().toString(36).slice(2, 10)}`;
    const club: PokerClub = {
      id,
      name: input.name,
      ownerId: input.ownerId,
      description: input.description,
      isPrivate: input.isPrivate ?? false,
      members: [input.ownerId],
      createdAt: new Date().toISOString(),
      weeklyTournamentName: `${input.name} Weekly Championship`,
    };

    this.clubs.set(id, club);
    return club;
  }

  joinClub(clubId: string, userId: string): PokerClub {
    const club = this.clubs.get(clubId);
    if (!club) throw new Error('Club not found');

    this.ensureProfile(userId);
    if (club.members.includes(userId)) return club;

    const next: PokerClub = {
      ...club,
      members: [...club.members, userId],
    };

    this.clubs.set(clubId, next);
    return next;
  }

  listClubs(): PokerClub[] {
    return Array.from(this.clubs.values()).sort((a, b) => b.members.length - a.members.length);
  }

  getSessionTracker(userId: string): SessionTracker {
    this.ensureProfile(userId);
    const records = this.sessions.get(userId) ?? [];

    const totalSessions = records.length;
    const totalHands = records.reduce((sum, entry) => sum + entry.handsPlayed, 0);
    const profits = records.map((entry) => entry.netProfit);
    const biggestPots = records
      .map((entry) => entry.biggestPot)
      .sort((a, b) => b - a)
      .slice(0, 5);
    const avgDuration =
      totalSessions === 0 ? 0 : Number((records.reduce((sum, entry) => sum + entry.durationMinutes, 0) / totalSessions).toFixed(1));

    return {
      userId,
      totalSessions,
      totalHands,
      bestSessionProfit: profits.length > 0 ? Math.max(...profits) : 0,
      worstSessionProfit: profits.length > 0 ? Math.min(...profits) : 0,
      averageSessionLengthMinutes: avgDuration,
      recentTrend: records.slice(-12).map((entry) => ({ at: entry.completedAt, net: entry.netProfit })),
      biggestPots,
    };
  }

  getAcademyModules(): AcademyModule[] {
    return [
      {
        id: 'academy-rules-101',
        level: 'beginner',
        title: 'Rules and Hand Rankings',
        summary: 'Learn game flow, blinds, position, and hand rankings with guided examples.',
        challenge: 'Complete 3 ranking quizzes with 90% accuracy.',
      },
      {
        id: 'academy-pressure-play',
        level: 'intermediate',
        title: 'Pressure and Pot Control',
        summary: 'Practice continuation bets, board texture reads, and river discipline.',
        challenge: 'Win 5 practice table drills without timing out.',
      },
      {
        id: 'academy-range-work',
        level: 'advanced',
        title: 'Range Construction and Exploit Play',
        summary: 'Balance opening ranges by position and exploit predictable opponents.',
        challenge: 'Submit 10 reviewed hands with action plans.',
      },
      {
        id: 'academy-pro-edge',
        level: 'pro',
        title: 'Tournament ICM and Endgame',
        summary: 'Master bubble pressure and final-table decision trees.',
        challenge: 'Complete final-table simulator at +3% EV target.',
      },
    ];
  }

  getCosmeticCatalog(): {
    cardBacks: string[];
    tableThemes: string[];
    dealerAvatars: string[];
    profileFrames: string[];
    chipDesigns: string[];
  } {
    return {
      cardBacks: ['classic-blue', 'onyx-gold', 'aurora-neon'],
      tableThemes: ['truestack-noir', 'mahogany-lounge', 'monaco-night'],
      dealerAvatars: ['aurora-croupier', 'velvet-host', 'summit-pro'],
      profileFrames: ['clean-silver', 'champion-gold', 'founders-black'],
      chipDesigns: ['ceramic-black', 'ivory-classic', 'matte-carbon'],
    };
  }

  private applyAchievementMilestones(profile: PlayerProfile): PlayerProfile {
    let next = profile;

    if (next.handsPlayed >= 1) {
      next = this.ensureAchievement(next, {
        id: 'first-hand',
        title: 'First Hand Played',
        description: 'Completed your first tracked hand.',
        rarity: 'common',
      });
    }

    if (next.handsPlayed >= 1000) {
      next = this.ensureAchievement(next, {
        id: 'hands-1000',
        title: '1,000 Hands Played',
        description: 'Tracked 1,000 hands at TRUE STACK Poker tables.',
        rarity: 'rare',
      });
    }

    if (next.bestWinStreak >= 5) {
      next = this.ensureAchievement(next, {
        id: 'comeback-king',
        title: 'Comeback King',
        description: 'Recovered into a 5-session win streak.',
        rarity: 'legendary',
      });
    }

    return next;
  }

  private ensureAchievement(
    profile: PlayerProfile,
    definition: { id: string; title: string; description: string; rarity: PlayerAchievement['rarity'] }
  ): PlayerProfile {
    if (profile.achievements.some((entry) => entry.id === definition.id)) return profile;

    return {
      ...profile,
      achievements: [
        ...profile.achievements,
        {
          ...definition,
          unlockedAt: new Date().toISOString(),
        },
      ],
    };
  }

  private computeBadges(level: number, sportsmanshipScore: number): string[] {
    const badges = ['trusted-player'];
    if (level >= 3) badges.push('grinder');
    if (level >= 8) badges.push('table-veteran');
    if (sportsmanshipScore >= 95) badges.push('sportsmanship-plus');
    return badges;
  }
}
