import type { ActionType, Street } from '../poker-engine.js';

export interface PlayerHudStats {
  hands: number;
  vpip: number;
  pfr: number;
}

/** Always available, unlike PlayerHudStats -- a win streak of 1 is meaningful the
 *  moment it happens, unlike a VPIP percentage from a one-hand sample. */
export interface PlayerProgress {
  hands: number;
  winStreak: number;
  bestWinStreak: number;
  /** Consecutive hands played without a win -- a "tilt" signal for the UI. Resets to 0
   *  the moment a win streak starts, symmetric with winStreak resetting on a loss. */
  coldStreak: number;
}

interface StreakEntry {
  winStreak: number;
  bestWinStreak: number;
  coldStreak: number;
}

const MIN_SAMPLE_HANDS = 5;

/**
 * VPIP/PFR opponent-read tracking for the table HUD.
 *
 * VPIP (voluntarily put money in pot) and PFR (preflop raise) are the two headline
 * stats every poker HUD leads with -- they're cheap to compute and tell you more about
 * how an opponent plays than anything else available at a glance. Both are counted at
 * most once per hand per player even if they act preflop multiple times (e.g. call
 * then later re-raise the same street), and both live in memory only: this is a read
 * on the current session, not a permanent record tied to an account.
 *
 * A small-sample guard hides the read until it means something -- "100% VPIP" after one
 * hand is noise, not information.
 */
export class PlayerStatsService {
  private readonly stats = new Map<string, PlayerHudStats>();
  private readonly vpipCountedThisHand = new Map<string, Set<string>>();
  private readonly pfrCountedThisHand = new Map<string, Set<string>>();
  private readonly streaks = new Map<string, StreakEntry>();

  private getOrInit(playerId: string): PlayerHudStats {
    const existing = this.stats.get(playerId);
    if (existing) return existing;
    const fresh: PlayerHudStats = { hands: 0, vpip: 0, pfr: 0 };
    this.stats.set(playerId, fresh);
    return fresh;
  }

  private getOrInitStreak(playerId: string): StreakEntry {
    const existing = this.streaks.get(playerId);
    if (existing) return existing;
    const fresh: StreakEntry = { winStreak: 0, bestWinStreak: 0, coldStreak: 0 };
    this.streaks.set(playerId, fresh);
    return fresh;
  }

  /** Call once per player at the moment a new hand deals them in -- this is the
   *  denominator, so it must count folds-without-acting too. */
  recordHandDealt(tableId: string, playerId: string): void {
    this.getOrInit(playerId).hands += 1;
    this.vpipCountedThisHand.delete(tableId);
    this.pfrCountedThisHand.delete(tableId);
  }

  /** Call for every action as it's applied. Only preflop actions affect these stats. */
  recordAction(tableId: string, playerId: string, type: ActionType, street: Street): void {
    if (street !== 'preflop') return;

    if (type === 'call' || type === 'bet' || type === 'raise' || type === 'all-in') {
      const counted = this.vpipCountedThisHand.get(tableId) ?? new Set<string>();
      if (!counted.has(playerId)) {
        counted.add(playerId);
        this.vpipCountedThisHand.set(tableId, counted);
        this.getOrInit(playerId).vpip += 1;
      }
    }

    // 'all-in' is deliberately excluded here -- an all-in call shouldn't inflate PFR the
    // way an all-in raise would, and ActionType doesn't distinguish the two.
    if (type === 'bet' || type === 'raise') {
      const counted = this.pfrCountedThisHand.get(tableId) ?? new Set<string>();
      if (!counted.has(playerId)) {
        counted.add(playerId);
        this.pfrCountedThisHand.set(tableId, counted);
        this.getOrInit(playerId).pfr += 1;
      }
    }
  }

  /** Null until there's enough of a sample for the percentage to mean anything. */
  getStats(playerId: string): PlayerHudStats | null {
    const entry = this.stats.get(playerId);
    if (!entry || entry.hands < MIN_SAMPLE_HANDS) return null;
    return { ...entry };
  }

  /** Call once per settled hand with everyone who was dealt in and who won. A winner's
   *  streak extends; everyone else who played (won or not) has theirs reset to 0 --
   *  a player who wasn't in the hand at all (never seated) is left untouched. */
  recordHandResult(participantIds: string[], winnerIds: string[]): void {
    const winners = new Set(winnerIds);
    for (const playerId of participantIds) {
      const entry = this.getOrInitStreak(playerId);
      if (winners.has(playerId)) {
        entry.winStreak += 1;
        entry.bestWinStreak = Math.max(entry.bestWinStreak, entry.winStreak);
        entry.coldStreak = 0;
      } else {
        entry.winStreak = 0;
        entry.coldStreak += 1;
      }
    }
  }

  /** Always available (unlike getStats) -- hands and win streak are meaningful from
   *  the very first hand, unlike a percentage that needs a real sample. */
  getProgress(playerId: string): PlayerProgress {
    const streak = this.streaks.get(playerId);
    return {
      hands: this.stats.get(playerId)?.hands ?? 0,
      winStreak: streak?.winStreak ?? 0,
      bestWinStreak: streak?.bestWinStreak ?? 0,
      coldStreak: streak?.coldStreak ?? 0,
    };
  }
}
