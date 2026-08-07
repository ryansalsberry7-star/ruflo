/**
 * Hero Card progression: rarity tiers and the flavor stat block (Aggression, Bluff,
 * Discipline, Reads) shown on a player's card.
 *
 * Level and rarity are derived from hands played this session (in-memory only, via
 * PlayerStatsService on the backend -- see /api/hud-stats/:id's `progress` field), not
 * a persisted account-wide record. Two of the four flavor stats (Aggression, Discipline)
 * are real reads once a player has a big-enough VPIP/PFR sample; the other two (Bluff,
 * Reads) have no real signal to draw from, so they're a stable per-player value seeded
 * from the player's id -- flavor, not analytics, and deliberately presented that way.
 */

export type RarityTier = 'gray' | 'bronze' | 'silver' | 'gold' | 'emerald' | 'ruby' | 'obsidian' | 'diamond' | 'aurora';

export interface RarityInfo {
  tier: RarityTier;
  label: string;
  /** Card border/frame color. */
  color: string;
  /** Brighter accent for glow effects. */
  glow: string;
}

const RARITY_TIERS: Array<RarityInfo & { minLevel: number }> = [
  { tier: 'gray', minLevel: 1, label: 'Gray', color: '#8B8F98', glow: '#C7CBD3' },
  { tier: 'bronze', minLevel: 3, label: 'Bronze', color: '#B08D57', glow: '#E3C08C' },
  { tier: 'silver', minLevel: 6, label: 'Silver', color: '#B9C2CC', glow: '#EAEFF4' },
  { tier: 'gold', minLevel: 10, label: 'Gold', color: '#CBB27E', glow: '#F1D9A0' },
  { tier: 'emerald', minLevel: 15, label: 'Emerald', color: '#2FBF71', glow: '#8CF0BA' },
  { tier: 'ruby', minLevel: 21, label: 'Ruby', color: '#E0344C', glow: '#FF8FA0' },
  { tier: 'obsidian', minLevel: 28, label: 'Obsidian', color: '#7C6BC4', glow: '#C4B6FF' },
  { tier: 'diamond', minLevel: 36, label: 'Diamond', color: '#7FE3FF', glow: '#D6F9FF' },
  { tier: 'aurora', minLevel: 45, label: 'Aurora', color: '#37E6B0', glow: '#FF8FE0' },
];

/** A level roughly every 6 hands -- tuned so a single session's worth of play (this is
 *  an in-memory, per-session number) visibly climbs a few rarity tiers, not just level 1-2. */
export function levelFromHands(hands: number): number {
  return Math.max(1, Math.floor(hands / 6) + 1);
}

export function rarityForLevel(level: number): RarityInfo {
  let match: RarityInfo = RARITY_TIERS[0];
  for (const entry of RARITY_TIERS) {
    if (level >= entry.minLevel) match = entry;
  }
  return match;
}

/** Stable per-player pseudo-random value in [min,max] -- same player + same salt always
 *  produces the same number, so a flavor stat doesn't reshuffle every render. */
function seededStat(playerId: string, salt: string, min: number, max: number): number {
  const source = `${playerId}:${salt}`;
  let hash = 7;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 131 + source.charCodeAt(index)) >>> 0;
  }
  return min + (hash % (max - min + 1));
}

export interface HeroCardStats {
  aggression: number;
  bluff: number;
  discipline: number;
  reads: number;
}

export function computeHeroCardStats(playerId: string, hud: { vpip: number; pfr: number } | null): HeroCardStats {
  return {
    aggression: hud ? Math.min(100, Math.round(hud.pfr * 2.2)) : seededStat(playerId, 'aggression', 45, 90),
    discipline: hud ? Math.min(100, Math.max(0, Math.round(100 - hud.vpip * 0.9))) : seededStat(playerId, 'discipline', 45, 90),
    bluff: seededStat(playerId, 'bluff', 50, 95),
    reads: seededStat(playerId, 'reads', 50, 95),
  };
}
