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

const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, id: `${rank}${suit[0]}` });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
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

  const nextState: TableState = {
    ...table,
    actionHistory: [...table.actionHistory, action],
    pot: table.pot + (action.amount ?? 0),
    players: table.players.map((entry) => entry.id === action.playerId ? { ...entry, stack: entry.stack - (action.amount ?? 0) } : entry),
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
  const ranks = cards.map((card) => card.rank);
  const unique = new Set(ranks);
  if (unique.size === 4) return 'pair';
  if (unique.size === 3) return 'three-of-a-kind';
  if (unique.size === 2) return 'two-pair';
  return 'high-card';
}
