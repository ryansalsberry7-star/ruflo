import type { GameVariant } from './betting';

/**
 * Client-side Monte Carlo win-equity estimate for the hero's own hand.
 *
 * No other seat's hole cards are ever sent to this client (the websocket only ever delivers
 * the viewer's own `hole_cards` event), so "vs random hands" is the only honest baseline here
 * -- there is no opponent range to model. Ties split the pot share across everyone tied for
 * best, matching how a real showdown pays out, so the result is a true equity percentage
 * rather than a naive win/loss count.
 */

const RANK_CHARS = '23456789TJQKA';
const SUITS = ['S', 'H', 'D', 'C'] as const;

interface ParsedCard {
  value: number;
  suit: string;
}

interface EvaluatedHand {
  categoryScore: number;
  rankValues: number[];
}

const FULL_DECK: string[] = SUITS.flatMap((suit) => RANK_CHARS.split('').map((rank) => `${rank}${suit}`));

function parseCard(id: string): ParsedCard {
  const suit = id.slice(-1).toUpperCase();
  const rankChar = id.slice(0, -1).toUpperCase();
  return { value: RANK_CHARS.indexOf(rankChar) + 2, suit };
}

function compareEvaluated(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.categoryScore !== b.categoryScore) return a.categoryScore - b.categoryScore;
  const length = Math.max(a.rankValues.length, b.rankValues.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (a.rankValues[index] ?? 0) - (b.rankValues[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function detectStraight(values: number[]): number {
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  if (unique.includes(14)) unique.unshift(1);
  let run = 1;
  let bestHigh = 0;
  for (let index = 1; index < unique.length; index += 1) {
    if (unique[index] === unique[index - 1] + 1) {
      run += 1;
      if (run >= 5) bestHigh = unique[index] === 1 ? 5 : unique[index];
    } else {
      run = 1;
    }
  }
  return bestHigh;
}

function evaluateFive(cards: ParsedCard[]): EvaluatedHand {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || right.value - left.value);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = detectStraight(values);

  if (flush && straightHigh === 14 && values.includes(10)) return { categoryScore: 9, rankValues: [14] };
  if (flush && straightHigh > 0) return { categoryScore: 8, rankValues: [straightHigh] };
  if (groups[0].count === 4) return { categoryScore: 7, rankValues: [groups[0].value, groups[1]?.value ?? 0] };
  if (groups[0].count === 3 && groups[1]?.count === 2) return { categoryScore: 6, rankValues: [groups[0].value, groups[1].value] };
  if (flush) return { categoryScore: 5, rankValues: values };
  if (straightHigh > 0) return { categoryScore: 4, rankValues: [straightHigh] };
  if (groups[0].count === 3) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.value).sort((a, b) => b - a);
    return { categoryScore: 3, rankValues: [groups[0].value, ...kickers] };
  }
  if (groups[0].count === 2 && groups[1]?.count === 2) {
    const pairValues = groups.filter((group) => group.count === 2).map((group) => group.value).sort((a, b) => b - a);
    const kicker = groups.find((group) => group.count === 1)?.value ?? 0;
    return { categoryScore: 2, rankValues: [...pairValues, kicker] };
  }
  if (groups[0].count === 2) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.value).sort((a, b) => b - a);
    return { categoryScore: 1, rankValues: [groups[0].value, ...kickers] };
  }
  return { categoryScore: 0, rankValues: values };
}

function combinationsOfFive(cards: ParsedCard[]): ParsedCard[][] {
  const results: ParsedCard[][] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a += 1)
    for (let b = a + 1; b < n - 3; b += 1)
      for (let c = b + 1; c < n - 2; c += 1)
        for (let d = c + 1; d < n - 1; d += 1)
          for (let e = d + 1; e < n; e += 1) results.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return results;
}

function bestHoldemHand(cards: ParsedCard[]): EvaluatedHand {
  let best: EvaluatedHand | null = null;
  for (const combo of combinationsOfFive(cards)) {
    const evaluated = evaluateFive(combo);
    if (!best || compareEvaluated(evaluated, best) > 0) best = evaluated;
  }
  return best ?? { categoryScore: 0, rankValues: [] };
}

/** Omaha requires exactly two hole cards and exactly three board cards -- not best-of-nine. */
function bestOmahaHand(hole: ParsedCard[], board: ParsedCard[]): EvaluatedHand {
  let best: EvaluatedHand | null = null;
  for (let a = 0; a < hole.length - 1; a += 1) {
    for (let b = a + 1; b < hole.length; b += 1) {
      for (let x = 0; x < board.length - 2; x += 1) {
        for (let y = x + 1; y < board.length - 1; y += 1) {
          for (let z = y + 1; z < board.length; z += 1) {
            const evaluated = evaluateFive([hole[a], hole[b], board[x], board[y], board[z]]);
            if (!best || compareEvaluated(evaluated, best) > 0) best = evaluated;
          }
        }
      }
    }
  }
  return best ?? { categoryScore: 0, rankValues: [] };
}

function shuffleInPlace<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export interface WinOddsInput {
  heroCards: string[];
  communityCards: string[];
  /** Opponents still live for this pot (not folded, hero excluded). */
  opponentCount: number;
  variant: GameVariant;
  trials?: number;
}

/** Returns a whole-number win-equity percentage, or null when there isn't enough information yet. */
export function estimateWinOdds({ heroCards, communityCards, opponentCount, variant, trials }: WinOddsInput): number | null {
  const holeCount = variant === 'plo' ? 4 : 2;
  if (heroCards.length < holeCount || opponentCount < 1) return null;

  const knownIds = new Set([...heroCards, ...communityCards].map((id) => id.toUpperCase()));
  const remainingDeck = FULL_DECK.filter((id) => !knownIds.has(id));
  const boardNeeded = 5 - communityCards.length;
  const cardsPerTrial = boardNeeded + opponentCount * holeCount;
  if (cardsPerTrial > remainingDeck.length) return null;

  // PLO combinatorics (60 five-card candidates per hand vs. NLH's 21) and wider tables cost
  // more per trial, so fewer trials keep this off the UI thread's noticeable-jank threshold.
  const effectiveTrials = trials ?? Math.max(60, Math.round((variant === 'plo' ? 140 : 240) / Math.max(1, opponentCount / 4)));

  const heroParsed = heroCards.map(parseCard);
  const knownBoardParsed = communityCards.map(parseCard);
  const pool = [...remainingDeck];

  let equitySum = 0;
  for (let trial = 0; trial < effectiveTrials; trial += 1) {
    shuffleInPlace(pool);
    const draw = pool.slice(0, cardsPerTrial);
    const board = [...knownBoardParsed, ...draw.slice(0, boardNeeded).map(parseCard)];

    const heroHand = variant === 'plo' ? bestOmahaHand(heroParsed, board) : bestHoldemHand([...heroParsed, ...board]);

    let heroIsBest = true;
    let tiedWithHero = 1;
    let cursor = boardNeeded;
    for (let opp = 0; opp < opponentCount; opp += 1) {
      const oppHole = draw.slice(cursor, cursor + holeCount).map(parseCard);
      cursor += holeCount;
      const oppHand = variant === 'plo' ? bestOmahaHand(oppHole, board) : bestHoldemHand([...oppHole, ...board]);
      const cmp = compareEvaluated(oppHand, heroHand);
      if (cmp > 0) {
        heroIsBest = false;
        break;
      }
      if (cmp === 0) tiedWithHero += 1;
    }

    if (heroIsBest) equitySum += 1 / tiedWithHero;
  }

  return Math.round((equitySum / effectiveTrials) * 100);
}
