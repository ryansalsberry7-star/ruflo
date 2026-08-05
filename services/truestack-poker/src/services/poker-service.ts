import { EventEmitter } from 'node:events';
import {
  applyAction,
  compareEvaluatedHands,
  createTable,
  dealFlop,
  dealRiver,
  dealTurn,
  evaluateBestHand,
  isBettingRoundClosed,
  postBlinds,
  type ActionType,
  type Card,
  type PlayerAction,
  type TableState,
} from '../poker-engine.js';
import type { StakeLevel, TournamentListing, ZeroRakePolicy } from '../contracts.js';
import { STAKE_LEVELS, TOURNAMENT_LISTINGS, ZERO_RAKE_POLICY } from '../contracts.js';
import { DealerService, type DealerHandState, type HandVerificationRecord } from './dealer-service.js';
import { HighHandService } from './high-hand-service.js';
import type { WalletService } from './wallet-service.js';

export interface SettledPayout {
  playerId: string;
  amount: number;
}

export interface SettledHand {
  tableId: string;
  handId: string;
  zeroRakePolicy: ZeroRakePolicy;
  totalPot: number;
  rakeTaken: 0;
  payouts: SettledPayout[];
  completedAt: string;
}

export interface TableListing {
  id: string;
  stake: StakeLevel;
  playersSeated: number;
  speed: StakeLevel['speed'];
  isPrivate: boolean;
}

export interface TournamentRegistration {
  tournamentId: string;
  userId: string;
  registeredAt: string;
}

export interface FeaturedTable {
  tableId: string;
  stakeLabel: string;
  playersSeated: number;
  spectators: number;
}

export interface PokerServiceOptions {
  /** Automatically advance streets and settle/redeal hands the instant a betting round closes. */
  autoProgress?: boolean;
}

export class PokerService extends EventEmitter {
  private readonly tables = new Map<string, TableState>();
  private readonly handHistory = new Map<string, SettledHand[]>();
  private readonly tablePrivacy = new Map<string, boolean>();
  private readonly tournamentRegistrations = new Map<string, Map<string, string>>();
  private readonly dealer = new DealerService();
  private readonly activeDealerHands = new Map<string, DealerHandState>();
  private readonly verificationRecords = new Map<string, HandVerificationRecord>();
  private readonly tableHandIndex = new Map<string, string[]>();

  constructor(
    private readonly highHands?: HighHandService,
    private readonly wallet?: WalletService,
    private readonly options: PokerServiceOptions = {}
  ) {
    super();
  }

  createCashTable(tableId: string, stakeId: string, players: Array<{ id: string; name: string; stack: number }>, isPrivate = false): TableState {
    const stake = STAKE_LEVELS.find((entry) => entry.id === stakeId);
    if (!stake) throw new Error('Unknown stake level');

    const table = createTable({
      id: tableId,
      smallBlind: stake.smallBlind,
      bigBlind: stake.bigBlind,
      players,
    });

    this.tables.set(tableId, table);
    this.tablePrivacy.set(tableId, isPrivate);
    this.startDealerHandForTable(tableId);
    this.getOrCreateListing(tableId, stake, isPrivate);
    return table;
  }

  joinTable(tableId: string, player: { id: string; name: string; stack: number }): TableState {
    const table = this.getTable(tableId);
    const existing = table.players.find((entry) => entry.id === player.id);
    if (existing) return table;

    const next: TableState = {
      ...table,
      players: [
        ...table.players,
        {
          ...player,
          folded: false,
          allIn: false,
          isDealer: false,
          isSmallBlind: false,
          isBigBlind: false,
          streetContribution: 0,
        },
      ],
    };

    if (!next.currentTurn) {
      next.currentTurn = player.id;
    }

    this.tables.set(tableId, next);
    if (next.actionHistory.length === 0 && next.currentStreet === 'preflop') {
      this.startDealerHandForTable(tableId);
    }

    return next;
  }

  getTable(tableId: string): TableState {
    const table = this.tables.get(tableId);
    if (!table) throw new Error('Table not found');
    return table;
  }

  isPlayerSeated(tableId: string, playerId: string): boolean {
    const table = this.tables.get(tableId);
    return table ? table.players.some((entry) => entry.id === playerId) : false;
  }

  listCashGames(filters?: { minBlind?: number; maxBlind?: number; speed?: StakeLevel['speed'] }): TableListing[] {
    const listings = Array.from(this.tables.values()).map((table) => {
      const stake = STAKE_LEVELS.find((entry) => entry.smallBlind === table.smallBlind && entry.bigBlind === table.bigBlind);
      if (!stake) throw new Error('Stake mapping not found');
      return {
        id: table.id,
        stake,
        playersSeated: table.players.length,
        speed: stake.speed,
        isPrivate: this.tablePrivacy.get(table.id) ?? false,
      } satisfies TableListing;
    });

    return listings.filter((listing) => {
      if (filters?.minBlind !== undefined && listing.stake.smallBlind < filters.minBlind) return false;
      if (filters?.maxBlind !== undefined && listing.stake.bigBlind > filters.maxBlind) return false;
      if (filters?.speed !== undefined && listing.speed !== filters.speed) return false;
      return true;
    });
  }

  listFeaturedTables(limit = 5): FeaturedTable[] {
    return this.listCashGames()
      .sort((a, b) => b.playersSeated - a.playersSeated)
      .slice(0, limit)
      .map((table, index) => ({
        tableId: table.id,
        stakeLabel: `$${table.stake.smallBlind}/$${table.stake.bigBlind}`,
        playersSeated: table.playersSeated,
        spectators: 30 + table.playersSeated * 3 + index,
      }));
  }

  listTournaments(): TournamentListing[] {
    return TOURNAMENT_LISTINGS.map((listing) => {
      const registrations = this.tournamentRegistrations.get(listing.id)?.size ?? 0;
      return {
        ...listing,
        registeredPlayers: listing.registeredPlayers + registrations,
      } satisfies TournamentListing;
    });
  }

  applyPlayerAction(tableId: string, playerId: string, type: ActionType, amount = 0): TableState {
    const current = this.getTable(tableId);
    const action: PlayerAction = { playerId, type, amount };
    let next = applyAction(current, action);
    next = this.withAdvancedTurn(next, playerId);
    this.tables.set(tableId, next);

    const hand = this.activeDealerHands.get(tableId);
    if (hand) {
      const tracked = this.dealer.recordAction(hand, {
        playerId,
        type,
        amount,
        street: next.currentStreet,
      });
      this.activeDealerHands.set(tableId, tracked);
    }

    if (this.options.autoProgress) {
      this.progressHand(tableId);
    }

    return this.getTable(tableId);
  }

  /**
   * The dealer brain: once a betting round closes, deal the next street automatically; once the
   * river closes (or the board runs out because everyone left is all-in), settle the hand and
   * redeal immediately. Runs for as long as 2+ players are seated, independent of any client.
   */
  private progressHand(tableId: string): void {
    // Capped so a bug can never spin this into an infinite loop; a real hand never needs more
    // than a handful of iterations (fold-out, or preflop -> flop -> turn -> river -> settle).
    for (let iterations = 0; iterations < 10; iterations += 1) {
      const table = this.getTable(tableId);
      if (!isBettingRoundClosed(table)) return;

      const stillContesting = table.players.filter((entry) => !entry.folded);
      if (stillContesting.length <= 1) {
        this.settleHand(tableId);
        continue;
      }

      const canStillBet = table.players.filter((entry) => !entry.folded && !entry.allIn && entry.stack > 0);
      if (table.currentStreet === 'river' || canStillBet.length < 2) {
        // All-in runout: no more betting is possible, so deal straight through to the river.
        while (this.getTable(tableId).currentStreet !== 'river') {
          this.advanceStreet(tableId);
        }
        this.settleHand(tableId);
        continue;
      }

      this.advanceStreet(tableId);
    }
  }

  forceFoldForTimeout(tableId: string, playerId: string): TableState {
    const current = this.getTable(tableId);
    // The hand may have advanced between the timer being scheduled and firing;
    // folding a player who is no longer to act would throw, so no-op instead.
    if (current.currentTurn !== playerId) {
      return current;
    }
    try {
      return this.applyPlayerAction(tableId, playerId, 'fold', 0);
    } catch {
      return current;
    }
  }

  getCurrentTurn(tableId: string): string | null {
    return this.getTable(tableId).currentTurn;
  }

  getActiveHandId(tableId: string): string | null {
    return this.activeDealerHands.get(tableId)?.handId ?? null;
  }

  advanceStreet(tableId: string): TableState {
    const current = this.getTable(tableId);
    let next: TableState = current;

    if (current.currentStreet === 'preflop') {
      next = dealFlop(current);
    } else if (current.currentStreet === 'flop') {
      next = dealTurn(current);
    } else if (current.currentStreet === 'turn') {
      next = dealRiver(current);
    } else if (current.currentStreet === 'river') {
      next = { ...current, currentStreet: 'showdown' };
    }

    const hand = this.activeDealerHands.get(tableId);
    if (hand) {
      if (next.currentStreet === 'flop') {
        const withFlop = this.dealer.dealFlop(hand);
        this.activeDealerHands.set(tableId, withFlop);
        next = { ...next, communityCards: [...withFlop.communityCards] };
      } else if (next.currentStreet === 'turn') {
        const withTurn = this.dealer.dealTurn(hand);
        this.activeDealerHands.set(tableId, withTurn);
        next = { ...next, communityCards: [...withTurn.communityCards] };
      } else if (next.currentStreet === 'river') {
        const withRiver = this.dealer.dealRiver(hand);
        this.activeDealerHands.set(tableId, withRiver);
        next = { ...next, communityCards: [...withRiver.communityCards] };
      }
    }

    this.tables.set(tableId, next);
    return next;
  }

  settleHand(tableId: string): SettledHand {
    const table = this.getTable(tableId);
    const hand = this.activeDealerHands.get(tableId) ?? this.startDealerHandForTable(tableId);
    const showdown = this.resolveDealerShowdown(table, hand);
    const winners = showdown.winnerIds.length > 0 ? showdown.winnerIds : table.players.map((entry) => entry.id);
    const payouts: SettledPayout[] = splitPotEvenly(showdown.pot, winners);

    const verification = this.dealer.completeHand(hand, {
      pot: showdown.pot,
      handRank: showdown.handRank,
      winners,
    });

    const settled: SettledHand = {
      tableId,
      handId: verification.handId,
      zeroRakePolicy: ZERO_RAKE_POLICY,
      totalPot: showdown.pot,
      rakeTaken: 0,
      payouts,
      completedAt: new Date().toISOString(),
    };

    this.verificationRecords.set(verification.handId, verification);
    const byTable = this.tableHandIndex.get(tableId) ?? [];
    this.tableHandIndex.set(tableId, [...byTable, verification.handId]);

    const history = this.handHistory.get(tableId) ?? [];
    this.handHistory.set(tableId, [...history, settled]);

    const playerNames = new Map(table.players.map((entry) => [entry.id, entry.name]));
    for (const winnerId of winners) {
      const holeCards = hand.holeCardsByPlayer[winnerId] ?? [];
      this.highHands?.recordHighHand({
        handId: verification.handId,
        playerId: winnerId,
        playerName: playerNames.get(winnerId) ?? winnerId,
        handName: showdown.handRank,
        achievedAt: settled.completedAt,
        tableId,
        cardsShown: holeCards.map((card) => card.id),
        communityCards: hand.communityCards.map((card) => card.id),
        replayEvents: verification.replay,
      });
    }

    for (const payout of payouts) {
      this.wallet?.creditWinnings(payout.playerId, payout.amount, tableId);
    }

    this.resetTableForNextHand(tableId);
    this.startDealerHandForTable(tableId);

    this.emit('hand-settled', settled);

    return settled;
  }

  getHandHistory(tableId: string): SettledHand[] {
    return this.handHistory.get(tableId) ?? [];
  }

  getHandVerification(handId: string): HandVerificationRecord {
    const record = this.verificationRecords.get(handId);
    if (!record) throw new Error('Hand verification record not found');
    return record;
  }

  getHandReplay(tableId: string, handId: string): { tableId: string; handId: string; events: HandVerificationRecord['replay'] } {
    const index = this.tableHandIndex.get(tableId) ?? [];
    if (!index.includes(handId)) throw new Error('Hand does not belong to the specified table');
    const verification = this.getHandVerification(handId);
    return {
      tableId,
      handId,
      events: verification.replay,
    };
  }

  getZeroRakePolicy(): ZeroRakePolicy {
    return ZERO_RAKE_POLICY;
  }

  registerTournament(tournamentId: string, userId: string): TournamentRegistration {
    const tournament = TOURNAMENT_LISTINGS.find((entry) => entry.id === tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const registrations = this.tournamentRegistrations.get(tournamentId) ?? new Map<string, string>();
    if (registrations.has(userId)) {
      throw new Error('Player already registered for tournament');
    }

    const registeredAt = new Date().toISOString();
    registrations.set(userId, registeredAt);
    this.tournamentRegistrations.set(tournamentId, registrations);

    return {
      tournamentId,
      userId,
      registeredAt,
    };
  }

  listTournamentRegistrations(tournamentId: string): TournamentRegistration[] {
    const tournament = TOURNAMENT_LISTINGS.find((entry) => entry.id === tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const registrations = this.tournamentRegistrations.get(tournamentId) ?? new Map<string, string>();
    return Array.from(registrations.entries()).map(([userId, registeredAt]) => ({
      tournamentId,
      userId,
      registeredAt,
    }));
  }

  private getOrCreateListing(tableId: string, stake: StakeLevel, isPrivate: boolean): TableListing {
    return {
      id: tableId,
      stake,
      playersSeated: this.getTable(tableId).players.length,
      speed: stake.speed,
      isPrivate,
    };
  }

  private withAdvancedTurn(table: TableState, actorId: string): TableState {
    const activePlayers = table.players.filter((entry) => !entry.folded && !entry.allIn && entry.stack > 0);
    if (activePlayers.length <= 1) {
      return { ...table, currentTurn: null };
    }

    const actorIndex = table.players.findIndex((entry) => entry.id === actorId);
    if (actorIndex < 0) {
      return table;
    }

    const nextIndex = this.findNextEligiblePlayerIndex(table.players, actorIndex);
    return { ...table, currentTurn: nextIndex >= 0 ? table.players[nextIndex].id : null };
  }

  private findNextEligiblePlayerIndex(players: TableState['players'], fromIndex: number): number {
    if (players.length === 0) return -1;

    for (let offset = 1; offset <= players.length; offset += 1) {
      const idx = (fromIndex + offset) % players.length;
      const candidate = players[idx];
      if (!candidate.folded && !candidate.allIn && candidate.stack > 0) {
        return idx;
      }
    }

    return -1;
  }

  private startDealerHandForTable(tableId: string): DealerHandState {
    const table = this.getTable(tableId);
    const players = table.players
      .filter((entry) => entry.stack > 0)
      .map((entry) => entry.id);

    const hand = this.dealer.startHand({
      tableId,
      players,
      buttonIndex: table.buttonIndex,
      smallBlind: table.smallBlind,
      bigBlind: table.bigBlind,
    });

    this.activeDealerHands.set(tableId, hand);
    return hand;
  }

  private resetTableForNextHand(tableId: string): void {
    const table = this.getTable(tableId);
    const nextButton = table.players.length === 0 ? 0 : (table.buttonIndex + 1) % table.players.length;

    let next: TableState = {
      ...table,
      buttonIndex: nextButton,
      currentStreet: 'preflop',
      pot: 0,
      sidePots: [],
      communityCards: [],
      actionHistory: [],
      currentTurn: null,
      currentBet: 0,
      minRaise: table.bigBlind,
      actedThisRound: [],
      completed: false,
      players: table.players.map((entry) => ({
        ...entry,
        folded: false,
        allIn: false,
        streetContribution: 0,
      })),
    };

    // postBlinds also recomputes isDealer/isSmallBlind/isBigBlind for the rotated button and
    // sets currentTurn to whoever acts first preflop; it's a no-op below 2 seated players.
    if (next.players.length >= 2) {
      next = postBlinds(next);
    }

    this.tables.set(tableId, next);
  }

  private resolveDealerShowdown(table: TableState, hand: DealerHandState): { winnerIds: string[]; pot: number; handRank: string } {
    const activePlayers = table.players.filter((player) => !player.folded);
    if (activePlayers.length <= 1) {
      const winner = activePlayers[0]?.id ?? table.players[0]?.id;
      const cards = winner ? this.cardsForPlayer(hand, winner) : [];
      return {
        winnerIds: winner ? [winner] : [],
        pot: table.pot,
        handRank: evaluateBestHand(cards).handRank,
      };
    }

    let bestHand = null as ReturnType<typeof evaluateBestHand> | null;
    let winners: string[] = [];

    for (const player of activePlayers) {
      const evaluated = evaluateBestHand(this.cardsForPlayer(hand, player.id));
      if (!bestHand) {
        bestHand = evaluated;
        winners = [player.id];
        continue;
      }

      const comparison = compareEvaluatedHands(evaluated, bestHand);
      if (comparison > 0) {
        bestHand = evaluated;
        winners = [player.id];
      } else if (comparison === 0) {
        winners.push(player.id);
      }
    }

    return {
      winnerIds: winners,
      pot: table.pot,
      handRank: bestHand?.handRank ?? 'high card',
    };
  }

  private cardsForPlayer(hand: DealerHandState, playerId: string): Card[] {
    return [...(hand.holeCardsByPlayer[playerId] ?? []), ...hand.communityCards];
  }
}

// Split a pot across winners in whole cents so the payouts always sum to the pot;
// any odd remaining cents go to the earliest-position winners.
function splitPotEvenly(pot: number, winners: string[]): SettledPayout[] {
  if (winners.length === 0) return [];
  const totalCents = Math.round(pot * 100);
  const baseCents = Math.floor(totalCents / winners.length);
  let remainderCents = totalCents - baseCents * winners.length;
  return winners.map((playerId) => {
    const cents = baseCents + (remainderCents > 0 ? 1 : 0);
    if (remainderCents > 0) remainderCents -= 1;
    return { playerId, amount: cents / 100 };
  });
}
