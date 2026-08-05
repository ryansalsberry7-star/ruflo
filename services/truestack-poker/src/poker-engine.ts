import { randomInt } from 'node:crypto';

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'check' | 'bet' | 'call' | 'raise' | 'all-in';

export interface PlayerAction {
  playerId: string;
  type: ActionType;
  amount?: number;
}

export interface PlayerSeat {
  id: string;
  name: string;
  stack: number;
  folded: boolean;
  allIn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

export interface TableState {
  id: string;
  smallBlind: number;
  bigBlind: number;
  buttonIndex: number;
  currentStreet: Street;
  pot: number;
  sidePots: Array<{ amount: number; eligiblePlayers: string[] }>;
  players: PlayerSeat[];
  deck: Card[];
  communityCards: Card[];
  actionHistory: PlayerAction[];
  currentTurn: string | null;
  completed: boolean;
}

export interface CreateTableInput {
  id: string;
  smallBlind: number;
  bigBlind: number;
  players: Array<{ id: string; name: string; stack: number }>;
  deck?: Card[];
}

export interface HandResult {
  winnerIds: string[];
  pot: number;
  handRank: string;
  showdown: string[];
}

export interface EvaluatedHand {
  handRank: string;
  categoryScore: number;
  rankValues: number[];
}

const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const rankValueMap: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const handCategoryOrder = [
  'high card',
  'pair',
  'two pair',
  'three of a kind',
  'straight',
  'flush',
  'full house',
  'four of a kind',
  'straight flush',
  'royal flush',
] as const;

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, id: `${rank}${suit[0]}` });
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  return deck;
}

export function createTable(input: CreateTableInput): TableState {
  const players = input.players.map((player, index) => ({
    ...player,
    folded: false,
    allIn: false,
    isDealer: index === 0,
    isSmallBlind: index === 1,
    isBigBlind: index === 2,
  }));

  return {
    id: input.id,
    smallBlind: input.smallBlind,
    bigBlind: input.bigBlind,
    buttonIndex: 0,
    currentStreet: 'preflop',
    pot: 0,
    sidePots: [],
    players,
    deck: input.deck ? [...input.deck] : makeDeck(),
    communityCards: [],
    actionHistory: [],
    currentTurn: players[0]?.id ?? null,
    completed: false,
  };
}

export function dealFlop(table: TableState): TableState {
  const deck = [...table.deck];
  const cards = deck.splice(0, 3);
  return { ...table, deck, communityCards: cards, currentStreet: 'flop' };
}

export function dealTurn(table: TableState): TableState {
  const deck = [...table.deck];
  const card = deck.splice(0, 1);
  return { ...table, deck, communityCards: [...table.communityCards, ...card], currentStreet: 'turn' };
}

export function dealRiver(table: TableState): TableState {
  const deck = [...table.deck];
  const card = deck.splice(0, 1);
  return { ...table, deck, communityCards: [...table.communityCards, ...card], currentStreet: 'river' };
}

export function applyAction(table: TableState, action: PlayerAction): TableState {
  const player = table.players.find((entry) => entry.id === action.playerId);
  if (!player) throw new Error('Player not found');
  if (table.currentTurn && table.currentTurn !== action.playerId) {
    throw new Error('Action out of turn');
  }
  if (player.folded || player.allIn || player.stack <= 0) {
    throw new Error('Player is not eligible to act');
  }

  if ((action.type === 'check' || action.type === 'fold') && (action.amount ?? 0) > 0) {
    throw new Error('This action cannot include a wager');
  }

  const committedAmount = action.type === 'all-in' ? player.stack : action.amount ?? 0;
  if (committedAmount > player.stack) {
    throw new Error('Insufficient stack for requested action');
  }

  const nextState: TableState = {
    ...table,
    actionHistory: [...table.actionHistory, { ...action, amount: committedAmount }],
    pot: table.pot + committedAmount,
    players: table.players.map((entry) => entry.id === action.playerId ? { ...entry, stack: entry.stack - committedAmount } : entry),
  };

  if (action.type === 'fold') {
    nextState.players = nextState.players.map((entry) => entry.id === action.playerId ? { ...entry, folded: true } : entry);
  }

  if (action.type === 'all-in') {
    nextState.players = nextState.players.map((entry) => entry.id === action.playerId ? { ...entry, allIn: true, stack: 0 } : entry);
  }

  return nextState;
}

export function resolveShowdown(table: TableState): HandResult {
  const activePlayers = table.players.filter((player) => !player.folded);
  const winners = activePlayers.length > 0 ? activePlayers.map((player) => player.id) : table.players.map((player) => player.id);

  return {
    winnerIds: winners,
    pot: table.pot,
    handRank: 'pair',
    showdown: winners,
  };
}

export function evaluateHandRank(cards: Card[]): string {
  return evaluateBestHand(cards).handRank;
}

export function evaluateBestHand(cards: Card[]): EvaluatedHand {
  if (cards.length === 0) {
    return { handRank: 'high card', categoryScore: 0, rankValues: [] };
  }

  if (cards.length < 5) {
    return evaluatePartialHand(cards);
  }

  const combinations = chooseFive(cards);
  let best: EvaluatedHand | null = null;

  for (const combination of combinations) {
    const evaluated = evaluateFiveCardHand(combination);
    if (!best || compareEvaluatedHands(evaluated, best) > 0) {
      best = evaluated;
    }
  }

  return best ?? { handRank: 'high card', categoryScore: 0, rankValues: [] };
}

export function compareEvaluatedHands(left: EvaluatedHand, right: EvaluatedHand): number {
  if (left.categoryScore !== right.categoryScore) {
    return left.categoryScore - right.categoryScore;
  }

  const maxLength = Math.max(left.rankValues.length, right.rankValues.length);
  for (let index = 0; index < maxLength; index += 1) {
    const delta = (left.rankValues[index] ?? 0) - (right.rankValues[index] ?? 0);
    if (delta !== 0) return delta;
  }

  return 0;
}

function evaluatePartialHand(cards: Card[]): EvaluatedHand {
  const counts = countRanks(cards);
  const grouped = sortGroups(counts);
  const orderedRanks = sortedUniqueRanks(cards);

  if (grouped[0]?.count === 4) {
    return { handRank: 'four of a kind', categoryScore: 7, rankValues: [grouped[0].value, grouped[1]?.value ?? 0] };
  }
  if (grouped[0]?.count === 3 && grouped[1]?.count >= 2) {
    return { handRank: 'full house', categoryScore: 6, rankValues: [grouped[0].value, grouped[1].value] };
  }
  if (grouped[0]?.count === 3) {
    return { handRank: 'three of a kind', categoryScore: 3, rankValues: [grouped[0].value, ...orderedRanks.filter((value) => value !== grouped[0].value)] };
  }
  if (grouped[0]?.count === 2 && grouped[1]?.count === 2) {
    const pairValues = grouped.filter((group) => group.count === 2).map((group) => group.value).sort((a, b) => b - a);
    const kicker = orderedRanks.find((value) => !pairValues.includes(value)) ?? 0;
    return { handRank: 'two pair', categoryScore: 2, rankValues: [...pairValues, kicker] };
  }
  if (grouped[0]?.count === 2) {
    return { handRank: 'pair', categoryScore: 1, rankValues: [grouped[0].value, ...orderedRanks.filter((value) => value !== grouped[0].value)] };
  }
  return { handRank: 'high card', categoryScore: 0, rankValues: orderedRanks };
}

function evaluateFiveCardHand(cards: Card[]): EvaluatedHand {
  const values = cards.map((card) => rankValueMap[card.rank]).sort((a, b) => b - a);
  const counts = countRanks(cards);
  const groups = sortGroups(counts);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = detectStraight(values);

  if (flush && straightHigh === 14 && values.includes(10)) {
    return { handRank: 'royal flush', categoryScore: 9, rankValues: [14] };
  }

  if (flush && straightHigh > 0) {
    return { handRank: 'straight flush', categoryScore: 8, rankValues: [straightHigh] };
  }

  if (groups[0]?.count === 4) {
    return { handRank: 'four of a kind', categoryScore: 7, rankValues: [groups[0].value, groups[1]?.value ?? 0] };
  }

  if (groups[0]?.count === 3 && groups[1]?.count === 2) {
    return { handRank: 'full house', categoryScore: 6, rankValues: [groups[0].value, groups[1].value] };
  }

  if (flush) {
    return { handRank: 'flush', categoryScore: 5, rankValues: values };
  }

  if (straightHigh > 0) {
    return { handRank: 'straight', categoryScore: 4, rankValues: [straightHigh] };
  }

  if (groups[0]?.count === 3) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.value).sort((a, b) => b - a);
    return { handRank: 'three of a kind', categoryScore: 3, rankValues: [groups[0].value, ...kickers] };
  }

  if (groups[0]?.count === 2 && groups[1]?.count === 2) {
    const pairValues = groups.filter((group) => group.count === 2).map((group) => group.value).sort((a, b) => b - a);
    const kicker = groups.find((group) => group.count === 1)?.value ?? 0;
    return { handRank: 'two pair', categoryScore: 2, rankValues: [...pairValues, kicker] };
  }

  if (groups[0]?.count === 2) {
    const kickers = groups.filter((group) => group.count === 1).map((group) => group.value).sort((a, b) => b - a);
    return { handRank: 'pair', categoryScore: 1, rankValues: [groups[0].value, ...kickers] };
  }

  return { handRank: 'high card', categoryScore: 0, rankValues: values };
}

function countRanks(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const value = rankValueMap[card.rank];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function sortGroups(counts: Map<number, number>): Array<{ value: number; count: number }> {
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || right.value - left.value);
}

function sortedUniqueRanks(cards: Card[]): number[] {
  return Array.from(new Set(cards.map((card) => rankValueMap[card.rank]))).sort((a, b) => b - a);
}

function detectStraight(values: number[]): number {
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  if (unique.includes(14)) unique.unshift(1);

  let run = 1;
  let bestHigh = 0;
  for (let index = 1; index < unique.length; index += 1) {
    if (unique[index] === unique[index - 1] + 1) {
      run += 1;
      if (run >= 5) {
        bestHigh = unique[index] === 1 ? 5 : unique[index];
      }
    } else {
      run = 1;
    }
  }

  return bestHigh;
}

function chooseFive(cards: Card[]): Card[][] {
  const results: Card[][] = [];
  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            results.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          }
        }
      }
    }
  }
  return results;
}
