import { EventEmitter } from 'node:events';
import {
  applyAction,
  compareEvaluatedHands,
  createTable,
  dealFlop,
  dealRiver,
  dealTurn,
  evaluateBestHand,
  evaluateOmahaHand,
  isBettingRoundClosed,
  postBlinds,
  roundCents,
  type ActionType,
  type Card,
  type PlayerAction,
  type TableState,
} from '../poker-engine.js';
import type { GameVariant, StakeLevel, TournamentListing, ZeroRakePolicy } from '../contracts.js';
import { GAME_VARIANT_LABELS, HOLE_CARD_COUNT, STAKE_LEVELS, TOURNAMENT_LISTINGS, ZERO_RAKE_POLICY } from '../contracts.js';
import { DealerService, type DealerHandState, type HandVerificationRecord } from './dealer-service.js';
import type { GameHostProvider } from './game-host-provider.js';
import { HighHandService } from './high-hand-service.js';
import { PlayerStatsService, type PlayerHudStats } from './player-stats-service.js';
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
  variant: GameVariant;
  variantLabel: string;
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

/** Default GameHostProvider: self-dealt, in-process, zero-rake. See game-host-provider.ts. */
export class PokerService extends EventEmitter implements GameHostProvider {
  private readonly tables = new Map<string, TableState>();
  private readonly handHistory = new Map<string, SettledHand[]>();
  private readonly tablePrivacy = new Map<string, boolean>();
  private readonly tournamentRegistrations = new Map<string, Map<string, string>>();
  private readonly dealer = new DealerService();
  private readonly activeDealerHands = new Map<string, DealerHandState>();
  private readonly verificationRecords = new Map<string, HandVerificationRecord>();
  private readonly tableHandIndex = new Map<string, string[]>();
  private readonly playerStats = new PlayerStatsService();

  constructor(
    private readonly highHands?: HighHandService,
    private readonly wallet?: WalletService,
    private readonly options: PokerServiceOptions = {}
  ) {
    super();
  }

  createCashTable(
    tableId: string,
    stakeId: string,
    players: Array<{ id: string; name: string; stack: number; isBot?: boolean }>,
    isPrivate = false,
    variant: GameVariant = 'nlh'
  ): TableState {
    const stake = STAKE_LEVELS.find((entry) => entry.id === stakeId);
    if (!stake) throw new Error('Unknown stake level');

    const table = createTable({
      id: tableId,
      variant,
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

  joinTable(tableId: string, player: { id: string; name: string; stack: number; isBot?: boolean }): TableState {
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

    // Blinds are otherwise posted only by createTable and by the redeal after a
    // settlement. A table that drained to fewer than two seats and then refilled would
    // sit at currentBet 0 forever, so every street checks through to a zero pot. Post
    // them here once the table is playable again; the currentBet guard prevents a
    // double-post when a hand is already live.
    if (next.players.length >= 2 && next.actionHistory.length === 0 && next.currentStreet === 'preflop' && next.currentBet === 0) {
      const withBlinds = postBlinds(this.getTable(tableId));
      this.tables.set(tableId, withBlinds);
      return withBlinds;
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
        variant: table.variant,
        variantLabel: GAME_VARIANT_LABELS[table.variant],
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
    // Recorded against the street the action was taken on (before this action can
    // possibly advance it), for the VPIP/PFR HUD stats.
    this.playerStats.recordAction(tableId, playerId, type, current.currentStreet);
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
      const dealtIds = this.activeDealerHands.get(tableId)?.holeCardsByPlayer;
      if (!isBettingRoundClosed(table, dealtIds ? new Set(Object.keys(dealtIds)) : null)) return;

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

  /**
   * The requesting player's own hole cards for the live hand.
   *
   * Deliberately scoped to a single player: there is no method that returns the whole
   * table's hole cards, so a caller cannot accidentally broadcast them. Callers must
   * send the result only to the socket authenticated as `playerId`.
   */
  getHoleCardsFor(tableId: string, playerId: string): Card[] {
    const hand = this.activeDealerHands.get(tableId);
    if (!hand) return [];
    const seated = this.tables.get(tableId)?.players.some((entry) => entry.id === playerId);
    if (!seated) return [];
    return [...(hand.holeCardsByPlayer[playerId] ?? [])];
  }

  advanceStreet(tableId: string): TableState {
    const current = this.getTable(tableId);
    let next: TableState = current;

    const hand = this.activeDealerHands.get(tableId);
    // Excludes anyone who joined mid-hand from being handed the first action on the new
    // street -- they hold no cards in this hand. Same guard as isBettingRoundClosed.
    const dealtIds = hand ? new Set(Object.keys(hand.holeCardsByPlayer)) : null;

    if (current.currentStreet === 'preflop') {
      next = dealFlop(current, dealtIds);
    } else if (current.currentStreet === 'flop') {
      next = dealTurn(current, dealtIds);
    } else if (current.currentStreet === 'turn') {
      next = dealRiver(current, dealtIds);
    } else if (current.currentStreet === 'river') {
      next = { ...current, currentStreet: 'showdown' };
    }

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

    // Zero-rake invariant. The facilitator model rests on never profiting from a pot,
    // so this is enforced rather than asserted in policy: every chip that entered the
    // pot must leave it in a payout. A rounding slip or a split-logic bug would quietly
    // become house revenue, which is exactly the claim we cannot afford to get wrong.
    const distributedCents = payouts.reduce((sum, payout) => sum + Math.round(payout.amount * 100), 0);
    const potCents = Math.round(showdown.pot * 100);
    if (distributedCents !== potCents) {
      throw new Error(
        `Zero-rake invariant violated on table ${tableId}: pot ${potCents} cents, distributed ${distributedCents} cents. Refusing to settle.`
      );
    }

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

    // Winnings return to the player's stack at the table, not to their wallet. Crediting
    // the wallet here would silently cash a player out of every pot they won while their
    // seat kept paying blinds, draining every stack toward zero over a session. The wallet
    // moves only on buy-in and cash-out (see cashOutPlayer).
    this.creditPayoutsToStacks(tableId, payouts);

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
    const table = this.getTable(tableId);
    return {
      id: tableId,
      stake,
      variant: table.variant,
      variantLabel: GAME_VARIANT_LABELS[table.variant],
      playersSeated: table.players.length,
      speed: stake.speed,
      isPrivate,
    };
  }

  private withAdvancedTurn(table: TableState, actorId: string): TableState {
    // A player who joins mid-hand is added to table.players immediately (so they can be
    // seen and dealt into the *next* hand), but they hold no cards in the hand already in
    // progress. Without this filter, turn rotation would still cycle around to them and
    // prompt them to act on a hand they were never dealt into.
    const dealtIds = this.activeDealerHands.get(table.id)?.holeCardsByPlayer;
    const isInHand = (entry: TableState['players'][number]) => !dealtIds || entry.id in dealtIds;

    const activePlayers = table.players.filter((entry) => !entry.folded && !entry.allIn && entry.stack > 0 && isInHand(entry));
    if (activePlayers.length <= 1) {
      return { ...table, currentTurn: null };
    }

    const actorIndex = table.players.findIndex((entry) => entry.id === actorId);
    if (actorIndex < 0) {
      return table;
    }

    const nextIndex = this.findNextEligiblePlayerIndex(table.players, actorIndex, isInHand);
    return { ...table, currentTurn: nextIndex >= 0 ? table.players[nextIndex].id : null };
  }

  private findNextEligiblePlayerIndex(
    players: TableState['players'],
    fromIndex: number,
    isInHand: (entry: TableState['players'][number]) => boolean = () => true
  ): number {
    if (players.length === 0) return -1;

    for (let offset = 1; offset <= players.length; offset += 1) {
      const idx = (fromIndex + offset) % players.length;
      const candidate = players[idx];
      if (!candidate.folded && !candidate.allIn && candidate.stack > 0 && isInHand(candidate)) {
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
      holeCardCount: HOLE_CARD_COUNT[table.variant],
    });

    this.activeDealerHands.set(tableId, hand);
    // Denominator for the VPIP/PFR HUD stats -- every player dealt in counts, including
    // one who folds preflop without ever taking a tracked action.
    for (const id of players) this.playerStats.recordHandDealt(tableId, id);
    return hand;
  }

  /** VPIP/PFR HUD read for a player, or null until there's a meaningful sample. */
  getPlayerHudStats(playerId: string): PlayerHudStats | null {
    return this.playerStats.getStats(playerId);
  }

  /** Pays settled pots back into the winners' seats. Run before the next hand's blinds are posted. */
  private creditPayoutsToStacks(tableId: string, payouts: SettledPayout[]): void {
    if (payouts.length === 0) return;
    const table = this.getTable(tableId);
    const byPlayer = new Map<string, number>();
    for (const payout of payouts) {
      byPlayer.set(payout.playerId, (byPlayer.get(payout.playerId) ?? 0) + payout.amount);
    }

    this.tables.set(tableId, {
      ...table,
      players: table.players.map((entry) => {
        const won = byPlayer.get(entry.id);
        return won ? { ...entry, stack: roundCents(entry.stack + won) } : entry;
      }),
    });
  }

  /**
   * Removes a player from the table and returns their remaining stack to their wallet.
   *
   * A player still live in a hand is folded first: chips already committed to the pot
   * belong to the pot and cannot be taken back off the table mid-hand.
   */
  cashOutPlayer(tableId: string, playerId: string): { playerId: string; amount: number } {
    const seated = this.getTable(tableId).players.find((entry) => entry.id === playerId);
    if (!seated) throw new Error('Player is not seated at this table');

    if (!seated.folded && !seated.allIn && this.getTable(tableId).currentTurn === playerId) {
      this.applyPlayerAction(tableId, playerId, 'fold', 0);
    }

    const table = this.getTable(tableId);
    const seat = table.players.find((entry) => entry.id === playerId);
    // settleHand may have redealt while folding, so re-read the stack before removing the seat.
    const amount = seat ? roundCents(seat.stack) : 0;
    const remaining = table.players.filter((entry) => entry.id !== playerId);

    this.tables.set(tableId, {
      ...table,
      players: remaining,
      buttonIndex: remaining.length === 0 ? 0 : table.buttonIndex % remaining.length,
      currentTurn: table.currentTurn === playerId ? null : table.currentTurn,
    });

    if (amount > 0) this.wallet?.creditWinnings(playerId, amount, tableId);
    return { playerId, amount };
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
      return {
        winnerIds: winner ? [winner] : [],
        pot: table.pot,
        handRank: winner ? this.evaluateForVariant(table.variant, hand, winner).handRank : 'high card',
      };
    }

    let bestHand = null as ReturnType<typeof evaluateBestHand> | null;
    let winners: string[] = [];

    for (const player of activePlayers) {
      const evaluated = this.evaluateForVariant(table.variant, hand, player.id);
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

  /**
   * Rank a player's hand under the table's variant.
   *
   * Hold'em takes the best five of the seven available cards. Omaha must use exactly two
   * hole cards and exactly three board cards, so it cannot share the Hold'em path -- doing
   * so would score hands the player does not actually hold (four hearts in hand plus one
   * on the board is not a flush).
   */
  private evaluateForVariant(variant: GameVariant, hand: DealerHandState, playerId: string) {
    const holeCards = hand.holeCardsByPlayer[playerId] ?? [];
    if (variant === 'plo') {
      return evaluateOmahaHand(holeCards, hand.communityCards);
    }
    return evaluateBestHand([...holeCards, ...hand.communityCards]);
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
