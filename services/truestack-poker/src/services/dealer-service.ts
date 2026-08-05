import { createHash, randomInt } from 'node:crypto';
import type { ActionType, Card, Rank, Suit } from '../poker-engine.js';

interface DealerActionRecord {
  at: string;
  playerId: string;
  type: ActionType;
  amount: number;
  street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

interface DealerReplayEvent {
  at: string;
  type:
    | 'hand_started'
    | 'hole_cards_dealt'
    | 'flop_dealt'
    | 'turn_dealt'
    | 'river_dealt'
    | 'player_action'
    | 'showdown';
  payload: Record<string, unknown>;
}

export interface DealerHandState {
  handId: string;
  tableId: string;
  startedAt: string;
  deckCommitment: string;
  deckHash: string;
  deck: Card[];
  drawIndex: number;
  burns: Card[];
  communityCards: Card[];
  holeCardsByPlayer: Record<string, Card[]>;
  actions: DealerActionRecord[];
  replay: DealerReplayEvent[];
}

export interface HandVerificationRecord {
  handId: string;
  tableId: string;
  generatedAt: string;
  completedAt: string;
  players: string[];
  deckCommitment: string;
  deckHash: string;
  deckGeneration: {
    source: 'server-crypto-rng';
    algorithm: 'fisher-yates';
    note: string;
  };
  burns: string[];
  communityCards: string[];
  actions: Array<{
    at: string;
    playerId: string;
    type: ActionType;
    amount: number;
    street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  }>;
  result: {
    pot: number;
    handRank: string;
    winners: string[];
  };
  replay: DealerReplayEvent[];
}

const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export class DealerService {
  startHand(input: {
    tableId: string;
    players: string[];
    buttonIndex: number;
    smallBlind: number;
    bigBlind: number;
  }): DealerHandState {
    const deck = this.createShuffledDeck();
    const handId = `${input.tableId}-${Date.now()}-${randomInt(1000, 9999)}`;
    const generatedAt = new Date().toISOString();

    const holeCardsByPlayer: Record<string, Card[]> = {};
    for (const playerId of input.players) holeCardsByPlayer[playerId] = [];

    let drawIndex = 0;
    for (let round = 0; round < 2; round += 1) {
      for (const playerId of input.players) {
        holeCardsByPlayer[playerId].push(deck[drawIndex]);
        drawIndex += 1;
      }
    }

    const deckHash = this.hashCardIds(deck.map((card) => card.id));
    const deckCommitment = this.hashCardIds([deckHash, handId, generatedAt]);

    const replay: DealerReplayEvent[] = [
      {
        at: generatedAt,
        type: 'hand_started',
        payload: {
          handId,
          tableId: input.tableId,
          players: input.players,
          buttonIndex: input.buttonIndex,
          smallBlind: input.smallBlind,
          bigBlind: input.bigBlind,
          deckCommitment,
        },
      },
      {
        at: generatedAt,
        type: 'hole_cards_dealt',
        payload: {
          recipients: input.players,
          cardCountEach: 2,
        },
      },
    ];

    return {
      handId,
      tableId: input.tableId,
      startedAt: generatedAt,
      deckCommitment,
      deckHash,
      deck,
      drawIndex,
      burns: [],
      communityCards: [],
      holeCardsByPlayer,
      actions: [],
      replay,
    };
  }

  dealFlop(hand: DealerHandState): DealerHandState {
    const burn = hand.deck[hand.drawIndex];
    const c1 = hand.deck[hand.drawIndex + 1];
    const c2 = hand.deck[hand.drawIndex + 2];
    const c3 = hand.deck[hand.drawIndex + 3];

    const next: DealerHandState = {
      ...hand,
      drawIndex: hand.drawIndex + 4,
      burns: [...hand.burns, burn],
      communityCards: [c1, c2, c3],
      replay: [
        ...hand.replay,
        {
          at: new Date().toISOString(),
          type: 'flop_dealt',
          payload: {
            burned: burn.id,
            communityCards: [c1.id, c2.id, c3.id],
          },
        },
      ],
    };

    return next;
  }

  dealTurn(hand: DealerHandState): DealerHandState {
    const burn = hand.deck[hand.drawIndex];
    const card = hand.deck[hand.drawIndex + 1];

    return {
      ...hand,
      drawIndex: hand.drawIndex + 2,
      burns: [...hand.burns, burn],
      communityCards: [...hand.communityCards, card],
      replay: [
        ...hand.replay,
        {
          at: new Date().toISOString(),
          type: 'turn_dealt',
          payload: {
            burned: burn.id,
            communityCard: card.id,
          },
        },
      ],
    };
  }

  dealRiver(hand: DealerHandState): DealerHandState {
    const burn = hand.deck[hand.drawIndex];
    const card = hand.deck[hand.drawIndex + 1];

    return {
      ...hand,
      drawIndex: hand.drawIndex + 2,
      burns: [...hand.burns, burn],
      communityCards: [...hand.communityCards, card],
      replay: [
        ...hand.replay,
        {
          at: new Date().toISOString(),
          type: 'river_dealt',
          payload: {
            burned: burn.id,
            communityCard: card.id,
          },
        },
      ],
    };
  }

  recordAction(
    hand: DealerHandState,
    action: {
      playerId: string;
      type: ActionType;
      amount: number;
      street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
    }
  ): DealerHandState {
    const at = new Date().toISOString();
    return {
      ...hand,
      actions: [...hand.actions, { at, ...action }],
      replay: [
        ...hand.replay,
        {
          at,
          type: 'player_action',
          payload: action,
        },
      ],
    };
  }

  completeHand(
    hand: DealerHandState,
    result: {
      pot: number;
      handRank: string;
      winners: string[];
    }
  ): HandVerificationRecord {
    const completedAt = new Date().toISOString();

    return {
      handId: hand.handId,
      tableId: hand.tableId,
      generatedAt: hand.startedAt,
      completedAt,
      players: Object.keys(hand.holeCardsByPlayer),
      deckCommitment: hand.deckCommitment,
      deckHash: hand.deckHash,
      deckGeneration: {
        source: 'server-crypto-rng',
        algorithm: 'fisher-yates',
        note: 'Deck generation uses server-side cryptographic randomness. This is transparent and auditable, but not a cryptographic proof system.',
      },
      burns: hand.burns.map((card) => card.id),
      communityCards: hand.communityCards.map((card) => card.id),
      actions: hand.actions,
      result,
      replay: [
        ...hand.replay,
        {
          at: completedAt,
          type: 'showdown',
          payload: result,
        },
      ],
    };
  }

  private createShuffledDeck(): Card[] {
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

  private hashCardIds(values: string[]): string {
    const hash = createHash('sha256');
    hash.update(values.join('|'));
    return hash.digest('hex');
  }
}
