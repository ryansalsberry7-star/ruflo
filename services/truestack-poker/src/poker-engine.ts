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
  /** Chips this player has committed during the current betting round (street). Resets each street. */
  streetContribution: number;
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
  /** Highest total streetContribution any player must match to stay in the current betting round. */
  currentBet: number;
  /** Minimum legal size for the next raise increment on the current street. */
  minRaise: number;
  /** Ids of players who have acted since the last bet/raise on the current street. */
  actedThisRound: string[];
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

/** Round to the nearest cent so repeated float arithmetic can't drift over a long-running table. */
export function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Small (2-player) tables use the heads-up rule: the button posts the small blind and acts first preflop. */
function assignPositions(playerCount: number, buttonIndex: number): { dealerIndex: number; smallBlindIndex: number; bigBlindIndex: number } {
  if (playerCount < 2) {
    return { dealerIndex: buttonIndex, smallBlindIndex: buttonIndex, bigBlindIndex: buttonIndex };
  }
  if (playerCount === 2) {
    return { dealerIndex: buttonIndex, smallBlindIndex: buttonIndex, bigBlindIndex: (buttonIndex + 1) % 2 };
  }
  return {
    dealerIndex: buttonIndex,
    smallBlindIndex: (buttonIndex + 1) % playerCount,
    bigBlindIndex: (buttonIndex + 2) % playerCount,
  };
}

/** First eligible (not folded, not all-in, has chips) player starting from `fromIndex + 1`, wrapping around the table. */
function findFirstActiveFromIndex(players: PlayerSeat[], fromIndex: number): string | null {
  if (players.length === 0) return null;
  for (let offset = 1; offset <= players.length; offset += 1) {
    const idx = (fromIndex + offset) % players.length;
    const candidate = players[idx];
    if (!candidate.folded && !candidate.allIn && candidate.stack > 0) {
      return candidate.id;
    }
  }
  return null;
}

export function createTable(input: CreateTableInput): TableState {
  const positions = assignPositions(input.players.length, 0);
  const players: PlayerSeat[] = input.players.map((player, index) => ({
    ...player,
    folded: false,
    allIn: false,
    isDealer: index === positions.dealerIndex,
    isSmallBlind: index === positions.smallBlindIndex,
    isBigBlind: index === positions.bigBlindIndex,
    streetContribution: 0,
  }));

  let table: TableState = {
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
    currentBet: 0,
    minRaise: input.bigBlind,
    actedThisRound: [],
  };

  if (players.length >= 2) {
    table = postBlinds(table);
  }

  return table;
}

/**
 * Deducts the small/big blind from the designated players' stacks, opens the preflop betting
 * round at bigBlind, and sets the first player to act (heads-up: the button/SB; 3+: UTG).
 */
export function postBlinds(table: TableState): TableState {
  const positions = assignPositions(table.players.length, table.buttonIndex);
  const smallBlindAmount = roundCents(Math.min(table.smallBlind, table.players[positions.smallBlindIndex]?.stack ?? 0));
  const bigBlindAmount = roundCents(Math.min(table.bigBlind, table.players[positions.bigBlindIndex]?.stack ?? 0));

  const players = table.players.map((entry, idx) => {
    const withPosition = {
      ...entry,
      isDealer: idx === positions.dealerIndex,
      isSmallBlind: idx === positions.smallBlindIndex,
      isBigBlind: idx === positions.bigBlindIndex,
    };
    if (idx === positions.smallBlindIndex && idx === positions.bigBlindIndex) return withPosition;
    if (idx === positions.smallBlindIndex) {
      return { ...withPosition, stack: roundCents(entry.stack - smallBlindAmount), streetContribution: smallBlindAmount, allIn: entry.stack - smallBlindAmount <= 0 };
    }
    if (idx === positions.bigBlindIndex) {
      return { ...withPosition, stack: roundCents(entry.stack - bigBlindAmount), streetContribution: bigBlindAmount, allIn: entry.stack - bigBlindAmount <= 0 };
    }
    return withPosition;
  });

  const firstToActId =
    table.players.length === 2
      ? players[positions.smallBlindIndex]?.id ?? null
      : findFirstActiveFromIndex(players, positions.bigBlindIndex);

  return {
    ...table,
    players,
    pot: roundCents(table.pot + smallBlindAmount + bigBlindAmount),
    currentBet: bigBlindAmount,
    minRaise: table.bigBlind,
    actedThisRound: [],
    currentTurn: firstToActId,
  };
}

/** Resets per-street betting state (contributions, current bet, min raise) and sets who acts first on the new street. */
function resetStreetBetting(table: TableState): TableState {
  const players = table.players.map((entry) => ({ ...entry, streetContribution: 0 }));
  return {
    ...table,
    players,
    currentBet: 0,
    minRaise: table.bigBlind,
    actedThisRound: [],
    currentTurn: findFirstActiveFromIndex(players, table.buttonIndex),
  };
}

export function dealFlop(table: TableState): TableState {
  const deck = [...table.deck];
  const cards = deck.splice(0, 3);
  return resetStreetBetting({ ...table, deck, communityCards: cards, currentStreet: 'flop' });
}

export function dealTurn(table: TableState): TableState {
  const deck = [...table.deck];
  const card = deck.splice(0, 1);
  return resetStreetBetting({ ...table, deck, communityCards: [...table.communityCards, ...card], currentStreet: 'turn' });
}

export function dealRiver(table: TableState): TableState {
  const deck = [...table.deck];
  const card = deck.splice(0, 1);
  return resetStreetBetting({ ...table, deck, communityCards: [...table.communityCards, ...card], currentStreet: 'river' });
}

/**
 * True once every player still able to act (not folded, not all-in) has both acted since the
 * last bet/raise and matched the current bet. Also true if fewer than 2 players can still act
 * (an all-in runout or a walk) since no further betting is possible.
 */
export function isBettingRoundClosed(table: TableState): boolean {
  const canStillAct = table.players.filter((entry) => !entry.folded && !entry.allIn && entry.stack > 0);
  if (canStillAct.length < 2) return true;

  return canStillAct.every((entry) => table.actedThisRound.includes(entry.id) && entry.streetContribution === table.currentBet);
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

  const amountToCall = roundCents(table.currentBet - player.streetContribution);
  let committedAmount = 0;
  let reopensAction = false;
  let nextCurrentBet = table.currentBet;
  let nextMinRaise = table.minRaise;

  if (action.type === 'check') {
    if (amountToCall > 0) throw new Error('Cannot check while a bet is outstanding; call, raise, or fold.');
  } else if (action.type === 'call') {
    if (amountToCall <= 0) throw new Error('Nothing to call; use check.');
    committedAmount = Math.min(amountToCall, player.stack);
  } else if (action.type === 'bet') {
    if (table.currentBet > 0) throw new Error('A bet is already outstanding; use raise instead of bet.');
    const requested = action.amount ?? 0;
    if (requested < Math.min(table.bigBlind, player.stack)) throw new Error('Bet is below the table minimum.');
    if (requested > player.stack) throw new Error('Insufficient stack for requested action');
    committedAmount = requested;
    nextCurrentBet = roundCents(player.streetContribution + committedAmount);
    nextMinRaise = Math.max(nextCurrentBet, table.bigBlind);
    reopensAction = true;
  } else if (action.type === 'raise') {
    if (table.currentBet <= 0) throw new Error('No bet to raise; use bet to open the action.');
    const raiseTo = action.amount ?? 0;
    if (raiseTo <= table.currentBet) throw new Error('Raise must exceed the current bet.');
    committedAmount = roundCents(raiseTo - player.streetContribution);
    if (committedAmount > player.stack) throw new Error('Insufficient stack for requested action');
    const isShortAllIn = committedAmount === player.stack && raiseTo - table.currentBet < table.minRaise;
    if (!isShortAllIn && raiseTo - table.currentBet < table.minRaise) {
      throw new Error(`Raise must be at least ${table.minRaise} more than the current bet.`);
    }
    nextCurrentBet = raiseTo;
    if (!isShortAllIn) nextMinRaise = raiseTo - table.currentBet;
    reopensAction = true;
  } else if (action.type === 'all-in') {
    committedAmount = player.stack;
    const newContribution = roundCents(player.streetContribution + committedAmount);
    if (newContribution > table.currentBet) {
      nextCurrentBet = newContribution;
      if (newContribution - table.currentBet >= table.minRaise) nextMinRaise = newContribution - table.currentBet;
      reopensAction = true;
    }
  }
  // 'fold' commits nothing and is validated by the eligibility check above.

  if (committedAmount > player.stack) {
    throw new Error('Insufficient stack for requested action');
  }

  const nextStreetContribution = roundCents(player.streetContribution + committedAmount);
  const becomesAllIn = action.type === 'all-in' || roundCents(player.stack - committedAmount) <= 0;

  const nextState: TableState = {
    ...table,
    actionHistory: [...table.actionHistory, { ...action, amount: committedAmount }],
    pot: roundCents(table.pot + committedAmount),
    currentBet: nextCurrentBet,
    minRaise: nextMinRaise,
    actedThisRound: reopensAction ? [action.playerId] : [...new Set([...table.actedThisRound, action.playerId])],
    players: table.players.map((entry) =>
      entry.id === action.playerId
        ? {
            ...entry,
            stack: roundCents(entry.stack - committedAmount),
            streetContribution: nextStreetContribution,
            folded: action.type === 'fold' ? true : entry.folded,
            allIn: becomesAllIn ? true : entry.allIn,
          }
        : entry
    ),
  };

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
