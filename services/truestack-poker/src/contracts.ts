import { z } from 'zod';

export type EnvironmentMode = 'play-money' | 'real-money-disabled';

/**
 * Supported game types.
 *
 * 'nlh' — No-Limit Hold'em: 2 hole cards, best five of the seven available, bets capped
 * only by the stack.
 * 'plo' — Pot-Limit Omaha: 4 hole cards, and a hand MUST use exactly two of them with
 * exactly three board cards. Raises are capped at the size of the pot.
 */
export type GameVariant = 'nlh' | 'plo';

export const GAME_VARIANT_LABELS: Record<GameVariant, string> = {
  nlh: "No-Limit Hold'em",
  plo: 'Pot-Limit Omaha',
};

/** Hole cards dealt per player. The 2-vs-4 split is what distinguishes the two games. */
export const HOLE_CARD_COUNT: Record<GameVariant, number> = { nlh: 2, plo: 4 };

export interface StakeLevel {
  id: string;
  smallBlind: number;
  bigBlind: number;
  buyInMin: number;
  buyInMax: number;
  speed: 'standard' | 'fast' | 'turbo';
}

export interface TournamentListing {
  id: string;
  name: string;
  entryFee: number;
  registeredPlayers: number;
  maxPlayers: number;
  startTimeIso: string;
  prizeStructure: string;
}

/**
 * Shape of a host's rake/fee disclosure. Field names stay the "zero rake" wording
 * because that's TRUE STACK's own house policy today, but the numeric fields are
 * plain `number` (not literal `0`) so a licensed white-label GameHostProvider that
 * does take a cut can still implement this contract truthfully.
 */
export interface ZeroRakePolicy {
  rakePercent: number;
  houseEdgePercent: number;
  potFeePercent: number;
  note: string;
}

export const ZERO_RAKE_POLICY: ZeroRakePolicy = {
  rakePercent: 0,
  houseEdgePercent: 0,
  potFeePercent: 0,
  note: 'No percentage is ever taken from poker pots.',
};

export const actionEnvelopeSchema = z.object({
  type: z.enum(['fold', 'check', 'bet', 'call', 'raise', 'all-in']),
  amount: z.number().nonnegative().optional(),
});

export type ActionEnvelope = z.infer<typeof actionEnvelopeSchema>;

export const STAKE_LEVELS: StakeLevel[] = [
  { id: 'micro-1', smallBlind: 0.05, bigBlind: 0.1, buyInMin: 5, buyInMax: 20, speed: 'standard' },
  { id: 'low-1', smallBlind: 1, bigBlind: 2, buyInMin: 100, buyInMax: 300, speed: 'standard' },
  { id: 'pro-1', smallBlind: 5, bigBlind: 10, buyInMin: 500, buyInMax: 2000, speed: 'fast' },
];

export const TOURNAMENT_LISTINGS: TournamentListing[] = [
  {
    id: 'daily-royal',
    name: 'Daily Royal Sprint',
    entryFee: 25,
    registeredPlayers: 48,
    maxPlayers: 128,
    startTimeIso: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    prizeStructure: 'Top 15% paid, progressive ladder',
  },
  {
    id: 'weekend-major',
    name: 'Weekend TRUE STACK Major',
    entryFee: 100,
    registeredPlayers: 220,
    maxPlayers: 1000,
    startTimeIso: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    prizeStructure: 'Top 12% paid, guaranteed prize pool',
  },
];

export interface TransparentFeeBreakdown {
  baseAmount: number;
  serviceFee: number;
  providerPassThrough: number;
  totalCharged: number;
  mode: 'instant' | 'standard';
  feeLabel: string;
}
