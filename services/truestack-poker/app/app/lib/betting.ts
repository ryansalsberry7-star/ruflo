/**
 * Betting rules and sizing math, mirrored from the server engine.
 *
 * The server is authoritative -- every action is re-validated in poker-engine.applyAction.
 * This exists so the UI can offer only the actions the server would accept, instead of
 * showing all five buttons and surfacing a rejection when the player taps the obvious one.
 * Kept pure and free of React so the rules can be reasoned about on their own.
 */

export interface TablePlayer {
  id: string;
  name: string;
  stack: number;
  folded: boolean;
  allIn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  /** Chips committed by this player on the current street. */
  streetContribution: number;
  /** Development-only simulated opponent. Badged at the seat so it never reads as human. */
  isBot?: boolean;
}

export interface TableState {
  id: string;
  currentStreet: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  pot: number;
  players: TablePlayer[];
  communityCards: Array<{ id: string }>;
  currentTurn: string | null;
  smallBlind: number;
  bigBlind: number;
  /** Highest street contribution any player must match to stay in the hand. */
  currentBet: number;
  /** Minimum legal raise increment on this street. */
  minRaise: number;
}

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  /** Opening the betting (no outstanding bet). Mutually exclusive with canRaise. */
  canBet: boolean;
  /** Increasing an existing bet. Mutually exclusive with canBet. */
  canRaise: boolean;
  canAllIn: boolean;
  /** Chips needed to match the current bet. Zero when checking is free. */
  amountToCall: number;
  /** Smallest legal total street contribution for a bet/raise. */
  minRaiseTo: number;
  /** Largest legal total street contribution (an all-in shove). */
  maxRaiseTo: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getLegalActions(table: TableState | null, playerId: string | null): LegalActions {
  const none: LegalActions = {
    canFold: false,
    canCheck: false,
    canCall: false,
    canBet: false,
    canRaise: false,
    canAllIn: false,
    amountToCall: 0,
    minRaiseTo: 0,
    maxRaiseTo: 0,
  };

  if (!table || !playerId) return none;
  const seat = table.players.find((entry) => entry.id === playerId);
  if (!seat) return none;
  // Acting out of turn, already folded, or with no chips behind: nothing is legal.
  if (table.currentTurn !== playerId || seat.folded || seat.allIn || seat.stack <= 0) return none;

  const amountToCall = round2(Math.max(0, table.currentBet - seat.streetContribution));
  const facingBet = amountToCall > 0;
  // Covering the bet fully is impossible when it exceeds the stack; the only way to
  // continue is shoving, which the all-in button handles.
  const canCoverCall = seat.stack >= amountToCall;

  const maxRaiseTo = round2(seat.streetContribution + seat.stack);
  const rawMinRaiseTo = facingBet ? table.currentBet + table.minRaise : Math.max(table.bigBlind, 0);
  // A short stack can still shove below the normal minimum, so clamp rather than forbid.
  const minRaiseTo = round2(Math.min(Math.max(rawMinRaiseTo, table.currentBet), maxRaiseTo));
  // Raising needs chips beyond a call; otherwise calling all-in is the only move left.
  const hasRaiseRoom = maxRaiseTo > table.currentBet;

  return {
    canFold: true,
    canCheck: !facingBet,
    canCall: facingBet && canCoverCall,
    canBet: !facingBet && hasRaiseRoom,
    canRaise: facingBet && hasRaiseRoom,
    canAllIn: seat.stack > 0,
    amountToCall: Math.min(amountToCall, seat.stack),
    minRaiseTo,
    maxRaiseTo,
  };
}

export interface SizingOption {
  label: string;
  /** Total street contribution to raise/bet to. */
  raiseTo: number;
}

/**
 * Pot-fraction sizing, the standard no-limit shorthand.
 *
 * A pot-sized raise puts in the call plus the pot as it would stand after that call,
 * so raiseTo = currentBet + fraction x (pot + amountToCall). Every option is clamped
 * into the legal window and de-duplicated, which drops "1/2 pot" when a short stack
 * makes it identical to a shove.
 */
export function getSizingOptions(table: TableState | null, legal: LegalActions): SizingOption[] {
  if (!table || (!legal.canBet && !legal.canRaise)) return [];

  const potAfterCall = table.pot + legal.amountToCall;
  const fractions: Array<{ label: string; value: number }> = [
    { label: '½ Pot', value: 0.5 },
    { label: '¾ Pot', value: 0.75 },
    { label: 'Pot', value: 1 },
  ];

  const options: SizingOption[] = [{ label: 'Min', raiseTo: legal.minRaiseTo }];
  for (const fraction of fractions) {
    const raiseTo = round2(table.currentBet + fraction.value * potAfterCall);
    if (raiseTo > legal.minRaiseTo && raiseTo < legal.maxRaiseTo) {
      options.push({ label: fraction.label, raiseTo });
    }
  }
  options.push({ label: 'All-in', raiseTo: legal.maxRaiseTo });

  const seen = new Set<number>();
  return options.filter((option) => {
    if (seen.has(option.raiseTo)) return false;
    seen.add(option.raiseTo);
    return true;
  });
}

export function clampRaiseTo(value: number, legal: LegalActions): number {
  return round2(Math.min(Math.max(value, legal.minRaiseTo), legal.maxRaiseTo));
}

/** Auto-actions a player can arm before the action reaches them. */
export type PreAction = 'fold' | 'check-fold' | 'call-any' | null;

/**
 * Resolve an armed pre-action against the situation that actually arrived.
 *
 * "Check/Fold" is the one that matters: it must check when checking is free and fold
 * only when a bet appeared, which is exactly why it cannot be decided when armed.
 */
export function resolvePreAction(preAction: PreAction, legal: LegalActions): ActionKind | null {
  if (!preAction) return null;
  if (preAction === 'fold') return legal.canFold ? 'fold' : null;
  if (preAction === 'check-fold') {
    if (legal.canCheck) return 'check';
    return legal.canFold ? 'fold' : null;
  }
  if (preAction === 'call-any') {
    if (legal.canCall) return 'call';
    if (legal.canCheck) return 'check';
    // Facing a bet larger than the stack: calling "any" means committing everything.
    return legal.canAllIn ? 'all-in' : null;
  }
  return null;
}

export function formatChips(amount: number): string {
  if (!Number.isFinite(amount)) return '$0';
  const rounded = round2(amount);
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}
