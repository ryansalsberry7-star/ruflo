import { z } from 'zod';

export type EnvironmentMode = 'play-money' | 'real-money-disabled';

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

export interface ZeroRakePolicy {
  rakePercent: 0;
  houseEdgePercent: 0;
  potFeePercent: 0;
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
