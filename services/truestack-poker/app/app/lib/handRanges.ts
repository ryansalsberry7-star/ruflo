/**
 * Starting-hand strategy data for the Starting Hand Matrix.
 *
 * This is an educational approximation, not solved game theory. Real GTO solves (PioSolver,
 * GTO+, etc.) are proprietary and computationally expensive to produce -- nothing here claims
 * to be that. Hand strength is scored with the Chen Formula (Bill Chen's widely-published
 * heuristic for ranking Hold'em starting hands), and opening ranges are built from commonly
 * published position percentages. "EV" and "Frequency" are illustrative, derived from the same
 * heuristic, not per-hand solver output -- they're here to make the toggles meaningful, not to
 * be taken as precise.
 */

export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
export type Rank = (typeof RANKS)[number];

const RANK_VALUE: Record<Rank, number> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
};

const CHEN_HIGH_CARD_POINTS: Record<Rank, number> = {
  A: 10, K: 8, Q: 7, J: 6, T: 5, '9': 4.5, '8': 4, '7': 3.5, '6': 3, '5': 2.5, '4': 2, '3': 1.5, '2': 1,
};

/**
 * Bill Chen's published formula for scoring a two-card Hold'em starting hand. Higher is
 * stronger. Pairs score at least 5; suited adds 2; connectedness adds a gap penalty (or a small
 * straight-potential bonus for low, closely-connected cards); half-point totals round up.
 */
export function chenScore(high: Rank, low: Rank, suited: boolean): number {
  const isPair = high === low;
  let score = CHEN_HIGH_CARD_POINTS[high];

  if (isPair) {
    score = Math.max(score * 2, 5);
  } else {
    if (suited) score += 2;
    const gap = RANK_VALUE[high] - RANK_VALUE[low] - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    // Extra straight potential for closely-connected low/mid cards.
    if (gap <= 1 && RANK_VALUE[high] <= 11) score += 1;
  }

  return Math.ceil(score);
}

export interface NlhHand {
  /** e.g. "AKs", "AKo", "AA" */
  id: string;
  high: Rank;
  low: Rank;
  suited: boolean;
  isPair: boolean;
  label: string;
  score: number;
  /** Row/col index into the 13x13 grid, 0 = A. */
  row: number;
  col: number;
}

function buildNlhHands(): NlhHand[] {
  const hands: NlhHand[] = [];
  for (let row = 0; row < RANKS.length; row += 1) {
    for (let col = 0; col < RANKS.length; col += 1) {
      const high = RANKS[Math.min(row, col)];
      const low = RANKS[Math.max(row, col)];
      const isPair = row === col;
      // Above the diagonal (row < col): suited. Below (row > col): offsuit. On it: pair.
      const suited = !isPair && row < col;
      const id = isPair ? `${high}${high}` : `${high}${low}${suited ? 's' : 'o'}`;
      hands.push({
        id,
        high,
        low,
        suited,
        isPair,
        label: id,
        score: chenScore(high, low, suited),
        row,
        col,
      });
    }
  }
  return hands;
}

export const NLH_HANDS: NlhHand[] = buildNlhHands();
export const NLH_HANDS_BY_ID: Record<string, NlhHand> = Object.fromEntries(NLH_HANDS.map((hand) => [hand.id, hand]));

export const NLH_POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'] as const;
export type NlhPosition = (typeof NLH_POSITIONS)[number];

export const POSITION_LABELS: Record<NlhPosition, string> = {
  UTG: 'Under the Gun',
  MP: 'Middle Position',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small Blind',
  BB: 'Big Blind',
};

/**
 * Commonly published first-in opening percentages by position (6-max convention -- the
 * concepts translate to 9-max by folding early seats into UTG/MP). BB's number covers the rare
 * "folded around to the walk" spot, not defending against a raise.
 */
export const OPEN_PERCENT: Record<NlhPosition, number> = {
  UTG: 12,
  MP: 16,
  CO: 24,
  BTN: 45,
  SB: 38,
  BB: 70,
};

export type ActionTier = 'raise' | 'mixed' | 'occasional' | 'fold';

export interface HandStrategy {
  action: ActionTier;
  actionLabel: string;
  /** 0-100. How often this action is taken from this position, in this simplified model. */
  frequency: number;
  /** Illustrative EV in big blinds -- not a solved value. See module doc comment. */
  ev: number;
}

const ACTION_LABEL: Record<ActionTier, string> = {
  raise: 'Raise',
  mixed: 'Raise / Fold',
  occasional: 'Occasional raise',
  fold: 'Fold',
};

/**
 * Illustrative EV: stronger hands and later position both raise it, scaled so it lands in a
 * plausible-looking bb range. Not solved output -- see module doc comment.
 */
function estimateEv(score: number, position: NlhPosition, action: ActionTier): number {
  if (action === 'fold') return 0;
  const positionMultiplier: Record<NlhPosition, number> = { UTG: 0.7, MP: 0.8, CO: 0.95, BTN: 1.25, SB: 0.85, BB: 0.75 };
  const raw = (score - 6) * 0.35 * positionMultiplier[position];
  return Math.round(raw * 10) / 10;
}

// Computed once at module load, not per lookup: rank every hand by score, then store each
// one's percentile. strategyFor is called up to 169 times per grid render (once per cell), so
// doing this per call -- a full sort plus a linear scan, each call -- would visibly stall the
// first render at a new position.
const HAND_PERCENTILE_BY_ID: Record<string, number> = (() => {
  const sorted = [...NLH_HANDS].sort((a, b) => b.score - a.score);
  const percentiles: Record<string, number> = {};
  sorted.forEach((hand, index) => {
    percentiles[hand.id] = (index / sorted.length) * 100;
  });
  return percentiles;
})();

const strategyCache = new Map<string, HandStrategy>();

/** The recommended strategy for a hand at a given position, built from its Chen score. */
export function strategyFor(hand: NlhHand, position: NlhPosition): HandStrategy {
  const cacheKey = `${hand.id}:${position}`;
  const cached = strategyCache.get(cacheKey);
  if (cached) return cached;

  const percentile = HAND_PERCENTILE_BY_ID[hand.id];
  const openPercent = OPEN_PERCENT[position];

  let action: ActionTier;
  let frequency: number;
  if (percentile < openPercent * 0.65) {
    action = 'raise';
    frequency = 100;
  } else if (percentile < openPercent) {
    action = 'mixed';
    frequency = 55;
  } else if (percentile < openPercent * 1.35) {
    action = 'occasional';
    frequency = 20;
  } else {
    action = 'fold';
    frequency = 0;
  }

  const strategy: HandStrategy = {
    action,
    actionLabel: ACTION_LABEL[action],
    frequency,
    ev: estimateEv(hand.score, position, action),
  };
  strategyCache.set(cacheKey, strategy);
  return strategy;
}

export type StrengthTier = 'premium' | 'strong' | 'playable' | 'marginal' | 'weak';

/** Position-independent strength tier, used for the base color coding on the grid. */
export function strengthTier(hand: NlhHand): StrengthTier {
  if (hand.score >= 14) return 'premium';
  if (hand.score >= 10) return 'strong';
  if (hand.score >= 7) return 'playable';
  if (hand.score >= 4) return 'marginal';
  return 'weak';
}

const STRENGTH_COLOR: Record<StrengthTier, string> = {
  premium: '#5FBE84',
  strong: '#8FCB6E',
  playable: '#D6C15A',
  marginal: '#C98A4B',
  weak: '#7A4A53',
};

export function strengthColor(hand: NlhHand): string {
  return STRENGTH_COLOR[strengthTier(hand)];
}

interface BlurbRule {
  matches: (hand: NlhHand) => boolean;
  text: string;
}

const BLURB_RULES: BlurbRule[] = [
  { matches: (h) => h.isPair && RANK_VALUE[h.high] >= 12, text: 'Premium pair. Raise for value from any position and is comfortable getting stacks in against most ranges.' },
  { matches: (h) => h.isPair && RANK_VALUE[h.high] >= 9, text: 'Strong pair. Raises well from most seats; plays fine multiway for set value when action gets heavy.' },
  { matches: (h) => h.isPair, text: 'Small-to-mid pair. Mostly a set-mining hand -- happy to see a cheap flop, less happy to stack off without improving.' },
  { matches: (h) => h.suited && RANK_VALUE[h.high] === 14 && RANK_VALUE[h.low] >= 10, text: 'Premium suited ace-broadway. Raises from anywhere, flops well, and has flush and straight potential behind it.' },
  { matches: (h) => h.suited && RANK_VALUE[h.high] === 14, text: 'Suited ace. Strong blocker and flush/nut-flush potential; plays better as a raise or 3-bet than a flat call.' },
  { matches: (h) => !h.suited && RANK_VALUE[h.high] === 14 && RANK_VALUE[h.low] >= 10, text: 'Big offsuit ace. Solid raising hand short-handed or in position; loses value multiway without a flush draw behind it.' },
  { matches: (h) => h.suited && RANK_VALUE[h.high] >= 11 && RANK_VALUE[h.low] >= 10, text: 'Suited broadway. Flops top pair or strong draws often, plays well as a raise from most seats.' },
  { matches: (h) => !h.suited && RANK_VALUE[h.high] >= 11 && RANK_VALUE[h.low] >= 10, text: 'Offsuit broadway. Decent raising hand, but loses some equity to suited combos and dominates poorly against bigger broadways.' },
  { matches: (h) => h.suited && RANK_VALUE[h.high] - RANK_VALUE[h.low] === 1, text: 'Suited connector. Speculative but plays great multiway or deep-stacked -- straights and flushes both live.' },
  { matches: (h) => h.suited, text: 'Suited hand. The suit adds real value even when the ranks are middling -- best used as a late-position or 3-bet-bluffing hand.' },
  { matches: () => true, text: 'Marginal-to-weak offsuit hand. Usually a fold unless you are deep in position and the table has folded to you.' },
];

export function strategyBlurb(hand: NlhHand): string {
  return BLURB_RULES.find((rule) => rule.matches(hand))?.text ?? '';
}

// ---------------------------------------------------------------------------------------------
// PLO -- categorical, not a 169-combo grid. Real PLO strategy is discussed in hand *shapes*
// (double-suited broadways, rundowns, etc.) rather than a single-card-pair matrix, so this is a
// lighter, first-pass model: a fixed set of well-known shape categories rather than exhaustive
// combinatorics.
// ---------------------------------------------------------------------------------------------

export interface PloCategory {
  id: string;
  label: string;
  example: string;
  description: string;
  strength: StrengthTier;
}

export const PLO_CATEGORIES: PloCategory[] = [
  { id: 'nut-ds-broadway', label: 'Nut double-suited broadway', example: 'A♠K♠Q♥J♥', description: 'The best PLO holdings: two suits, all high cards, nut flush and straight potential on both sides.', strength: 'premium' },
  { id: 'ds-pair-broadway', label: 'Double-suited pair + broadways', example: 'A♠A♥K♠Q♥', description: 'Big pair with two live suits and high card strength behind it. Raises from anywhere.', strength: 'premium' },
  { id: 'rundown-ds', label: 'Double-suited rundown', example: '9♠8♠7♥6♥', description: 'Four connected cards across two suits. Flops well disguised straights, flushes, and wraps.', strength: 'strong' },
  { id: 'rundown-single', label: 'Single-suited rundown', example: '9♠8♸7♥6♠', description: 'Connected cards with one live suit. Strong wrap and straight potential, less redraw value than double-suited.', strength: 'strong' },
  { id: 'top-pair-suited', label: 'Top pair, single-suited', example: 'A♠A♧8♠5', description: 'Premium pair with one suit and two dangling low cards. Good raising hand, but the danglers add little.', strength: 'strong' },
  { id: 'mid-pair-ds', label: 'Middle pair, double-suited', example: 'T♠T♥9♠8♥', description: 'Solid multiway hand with real redraw potential, but rarely a hand to stack off preflop.', strength: 'playable' },
  { id: 'gappers-ds', label: 'Double-suited one-gappers', example: 'J♠T♥9♥7♥', description: 'Two live suits with a gap in the rundown. Plays well but flops fewer direct wraps than a true rundown.', strength: 'playable' },
  { id: 'dry-aces', label: 'Dry (unsuited) aces', example: 'A♣7♥2♠K♦', description: 'A pair of aces with no suits and disconnected low cards. Still a raise, but far weaker than it looks -- easy to overvalue.', strength: 'playable' },
  { id: 'low-pair-ds', label: 'Low pair, double-suited', example: '5♠5♥4♠3♥', description: 'Speculative multiway hand. Needs to flop big (set, wrap, or strong flush draw) to continue.', strength: 'marginal' },
  { id: 'disconnected', label: 'Disconnected, single-suited', example: 'K♠Q♥9♥4♢', description: 'Cards that do not work well together despite a high card or two. Usually a fold outside the blinds.', strength: 'marginal' },
  { id: 'trash', label: 'Trash / no synergy', example: 'K♠8♥4♥2♥', description: 'No suits working together, no connectivity. Fold from every position.', strength: 'weak' },
];

export const PLO_OPEN_PERCENT: Record<NlhPosition, number> = {
  UTG: 8,
  MP: 12,
  CO: 20,
  BTN: 35,
  SB: 28,
  BB: 55,
};

const PLO_STRENGTH_RANK: Record<StrengthTier, number> = { premium: 0, strong: 1, playable: 2, marginal: 3, weak: 4 };

export function ploStrategyFor(category: PloCategory, position: NlhPosition): HandStrategy {
  const rank = PLO_STRENGTH_RANK[category.strength];
  const totalTiers = 5;
  const percentile = (rank / totalTiers) * 100;
  const openPercent = PLO_OPEN_PERCENT[position];

  let action: ActionTier;
  let frequency: number;
  if (percentile < openPercent * 0.5) {
    action = 'raise';
    frequency = 100;
  } else if (percentile < openPercent) {
    action = 'mixed';
    frequency = 50;
  } else if (percentile < openPercent * 1.4) {
    action = 'occasional';
    frequency = 15;
  } else {
    action = 'fold';
    frequency = 0;
  }

  const positionMultiplier: Record<NlhPosition, number> = { UTG: 0.7, MP: 0.8, CO: 0.95, BTN: 1.2, SB: 0.85, BB: 0.75 };
  const ev = action === 'fold' ? 0 : Math.round((totalTiers - rank) * 0.6 * positionMultiplier[position] * 10) / 10;

  return { action, actionLabel: ACTION_LABEL[action], frequency, ev };
}

export function ploStrengthColor(category: PloCategory): string {
  return STRENGTH_COLOR[category.strength];
}
