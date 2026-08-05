import { randomInt } from 'node:crypto';
import { evaluateBestHand, type ActionType, type Card, type TableState } from '../poker-engine.js';
import type { PokerService } from './poker-service.js';

/**
 * Development-only simulated opponents.
 *
 * TRUE STACK's product claim is "no house edge, no bots, no cut of the pot", and the
 * trust centre reports noHousePlayers: true. These exist purely so a solo developer can
 * watch a table run end to end, and they are built so they cannot leak into a real
 * deployment: construction throws under NODE_ENV=production, they are off unless
 * TRUESTACK_DEV_BOTS is set, and every bot seat carries isBot: true so clients badge it
 * rather than passing it off as a human.
 */

export type BotStyle = 'tight' | 'balanced' | 'loose-aggressive';

export interface BotProfile {
  id: string;
  name: string;
  style: BotStyle;
}

export interface BotServiceOptions {
  /** Base delay before a bot acts, so hands are watchable rather than instant. */
  thinkTimeMs?: number;
  /** Random extra delay on top of the base, to avoid a metronomic feel. */
  thinkJitterMs?: number;
}

const STYLE_TRAITS: Record<BotStyle, { callThreshold: number; raiseThreshold: number; aggression: number }> = {
  // callThreshold/raiseThreshold are hand-strength cutoffs in [0,1]; aggression is the
  // chance of betting a strong hand rather than trapping with it.
  tight: { callThreshold: 0.36, raiseThreshold: 0.72, aggression: 0.35 },
  balanced: { callThreshold: 0.28, raiseThreshold: 0.62, aggression: 0.5 },
  'loose-aggressive': { callThreshold: 0.16, raiseThreshold: 0.48, aggression: 0.75 },
};

const BOT_ROSTER: BotProfile[] = [
  { id: 'bot-nova', name: 'Nova', style: 'tight' },
  { id: 'bot-rook', name: 'Rook', style: 'balanced' },
  { id: 'bot-juno', name: 'Juno', style: 'loose-aggressive' },
  { id: 'bot-cass', name: 'Cass', style: 'balanced' },
  { id: 'bot-vega', name: 'Vega', style: 'tight' },
  { id: 'bot-onyx', name: 'Onyx', style: 'loose-aggressive' },
];

function randomFloat(): number {
  return randomInt(0, 10_000) / 10_000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Hand strength in [0,1].
 *
 * Postflop this is the evaluator's category (high card .. royal flush) normalised.
 * Preflop only two cards exist, so category alone would rate almost everything as
 * "high card"; the high-card rank and a pair/suited bonus stand in instead.
 */
export function estimateHandStrength(holeCards: Card[], communityCards: Card[]): number {
  if (holeCards.length === 0) return 0;

  if (communityCards.length === 0) {
    const values = holeCards.map((card) => evaluateBestHand([card]).rankValues[0] ?? 0);
    const high = Math.max(...values);
    const low = Math.min(...values);
    const isPair = values.length === 2 && values[0] === values[1];
    const isSuited = holeCards.length === 2 && holeCards[0].suit === holeCards[1].suit;
    const connected = Math.abs(high - low) <= 2;

    let strength = (high - 2) / 12 * 0.55 + (low - 2) / 12 * 0.2;
    if (isPair) strength += 0.3;
    if (isSuited) strength += 0.07;
    if (connected && !isPair) strength += 0.04;
    return Math.min(1, Math.max(0, strength));
  }

  const evaluated = evaluateBestHand([...holeCards, ...communityCards]);
  const categoryStrength = evaluated.categoryScore / 9;
  // Break ties within a category by top rank so two pairs of different height differ.
  const kicker = ((evaluated.rankValues[0] ?? 0) - 2) / 12;
  return Math.min(1, categoryStrength * 0.85 + kicker * 0.15);
}

export interface BotDecision {
  type: ActionType;
  amount: number;
}

/**
 * Pick an action for a bot. Pure and exported so the policy can be tested without timers.
 *
 * Only ever returns actions the engine accepts: check/bet when nothing is outstanding,
 * fold/call/raise when facing one, and a call clamped to the stack when a bet exceeds it.
 */
export function decideBotAction(
  table: TableState,
  botId: string,
  holeCards: Card[],
  style: BotStyle,
  roll: () => number = randomFloat
): BotDecision {
  const seat = table.players.find((entry) => entry.id === botId);
  if (!seat) return { type: 'fold', amount: 0 };

  const traits = STYLE_TRAITS[style];
  const strength = estimateHandStrength(holeCards, table.communityCards);
  const amountToCall = round2(Math.max(0, table.currentBet - seat.streetContribution));

  if (amountToCall <= 0) {
    // Nothing to call: check, or open with a hand worth betting.
    const wantsToBet = strength >= traits.raiseThreshold && roll() < traits.aggression;
    if (!wantsToBet) return { type: 'check', amount: 0 };

    const sizing = table.pot * (0.4 + roll() * 0.5);
    const bet = round2(Math.min(Math.max(sizing, table.bigBlind), seat.stack));
    if (bet <= 0 || bet >= seat.stack) return { type: 'check', amount: 0 };
    return { type: 'bet', amount: bet };
  }

  // Facing a bet. Price it: the worse the pot odds, the stronger the hand must be.
  const potOdds = amountToCall / (table.pot + amountToCall);
  const required = traits.callThreshold + potOdds * 0.35;

  if (strength < required) {
    // Never fold when checking is effectively free relative to the stack.
    return amountToCall >= seat.stack * 0.02 ? { type: 'fold', amount: 0 } : { type: 'call', amount: Math.min(amountToCall, seat.stack) };
  }

  const canRaise = seat.stack > amountToCall;
  if (strength >= traits.raiseThreshold && canRaise && roll() < traits.aggression) {
    const raiseTo = round2(table.currentBet + Math.max(table.minRaise, table.pot * (0.5 + roll() * 0.4)));
    const maxRaiseTo = round2(seat.streetContribution + seat.stack);
    if (raiseTo < maxRaiseTo) return { type: 'raise', amount: raiseTo };
    return { type: 'all-in', amount: 0 };
  }

  if (amountToCall >= seat.stack) return { type: 'all-in', amount: 0 };
  return { type: 'call', amount: amountToCall };
}

export class BotService {
  private readonly profiles = new Map<string, BotProfile>();
  private readonly tables = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private acting = false;
  private readonly thinkTimeMs: number;
  private readonly thinkJitterMs: number;

  constructor(
    private readonly poker: PokerService,
    options: BotServiceOptions = {}
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'BotService cannot run in production: TRUE STACK advertises no house players. It exists only for local simulation.'
      );
    }
    // Fast enough that a full hand plays out in seconds, slow enough to watch a decision
    // land. Tunable via TRUESTACK_DEV_BOT_SPEED_MS for step-through debugging.
    const configured = Number.parseInt(process.env.TRUESTACK_DEV_BOT_SPEED_MS ?? '', 10);
    const base = Number.isFinite(configured) ? Math.max(0, configured) : 350;
    this.thinkTimeMs = options.thinkTimeMs ?? base;
    this.thinkJitterMs = options.thinkJitterMs ?? Math.round(base * 0.8);
  }

  /**
   * Clears seats held by non-bot accounts so a simulated table can actually run.
   *
   * The demo table seeds Ada/Linus/Grace, who have no client attached. Whenever the turn
   * lands on one of them the hand stalls -- the turn timer that would normally force a
   * fold only runs while a websocket is subscribed. Returns their chips to their wallets
   * exactly as a real cash-out would; they re-take a seat through the UI.
   */
  clearIdleHumanSeats(tableId: string): number {
    const idle = this.poker.getTable(tableId).players.filter((entry) => !entry.isBot);
    for (const seat of idle) {
      this.poker.cashOutPlayer(tableId, seat.id);
    }
    return idle.length;
  }

  /** Seats simulated opponents and returns the profiles actually added. */
  seatBots(tableId: string, count: number, buyIn = 100): BotProfile[] {
    const added: BotProfile[] = [];
    for (const profile of BOT_ROSTER.slice(0, Math.max(0, Math.min(count, BOT_ROSTER.length)))) {
      if (this.poker.isPlayerSeated(tableId, profile.id)) continue;
      this.poker.joinTable(tableId, {
        id: profile.id,
        name: profile.name,
        stack: buyIn,
        isBot: true,
      });
      this.profiles.set(profile.id, profile);
      added.push(profile);
    }
    this.tables.add(tableId);
    return added;
  }

  listSeatedBots(tableId: string): BotProfile[] {
    const table = this.poker.getTable(tableId);
    return table.players
      .filter((entry) => entry.isBot)
      .map((entry) => this.profiles.get(entry.id))
      .filter((profile): profile is BotProfile => !!profile);
  }

  removeBots(tableId: string): number {
    const bots = this.poker.getTable(tableId).players.filter((entry) => entry.isBot);
    for (const bot of bots) {
      this.poker.cashOutPlayer(tableId, bot.id);
      this.profiles.delete(bot.id);
    }
    return bots.length;
  }

  /**
   * Polls for bot turns rather than subscribing to an event.
   *
   * Turns change on player actions, street advances, and redeals after settlement, so a
   * single tick that asks "whose turn is it?" covers every path without the service
   * needing to know which of them happened.
   */
  start(intervalMs = 150): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Never hold the process open on this timer alone.
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    // One decision at a time; a slow think must not stack up overlapping actions.
    if (this.acting) return;
    this.acting = true;
    try {
      for (const tableId of this.tables) {
        let table: TableState;
        try {
          table = this.poker.getTable(tableId);
        } catch {
          continue;
        }

        const turn = table.currentTurn;
        if (!turn) continue;
        const profile = this.profiles.get(turn);
        if (!profile) continue;

        await new Promise((resolve) => setTimeout(resolve, this.thinkTimeMs + randomInt(0, this.thinkJitterMs + 1)));

        // The hand may have moved on while this bot was "thinking".
        const fresh = this.poker.getTable(tableId);
        if (fresh.currentTurn !== turn) continue;

        const decision = decideBotAction(fresh, turn, this.poker.getHoleCardsFor(tableId, turn), profile.style);
        try {
          this.poker.applyPlayerAction(tableId, turn, decision.type, decision.amount);
        } catch {
          // The engine is authoritative; if it rejects the choice, fold so the table
          // cannot stall waiting on a bot that keeps proposing an illegal action.
          try {
            this.poker.applyPlayerAction(tableId, turn, 'fold', 0);
          } catch {
            // Table already moved past this seat; nothing to do.
          }
        }
      }
    } finally {
      this.acting = false;
    }
  }
}
