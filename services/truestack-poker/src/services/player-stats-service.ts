import type { ActionType, Street } from '../poker-engine.js';

export interface PlayerHudStats {
  hands: number;
  vpip: number;
  pfr: number;
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

  private getOrInit(playerId: string): PlayerHudStats {
    const existing = this.stats.get(playerId);
    if (existing) return existing;
    const fresh: PlayerHudStats = { hands: 0, vpip: 0, pfr: 0 };
    this.stats.set(playerId, fresh);
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
}
