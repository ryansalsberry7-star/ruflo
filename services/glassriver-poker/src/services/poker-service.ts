import {
  applyAction,
  createTable,
  dealFlop,
  dealRiver,
  dealTurn,
  resolveShowdown,
  type ActionType,
  type PlayerAction,
  type TableState,
} from '../poker-engine.js';
import type { StakeLevel, TournamentListing, ZeroRakePolicy } from '../contracts.js';
import { STAKE_LEVELS, TOURNAMENT_LISTINGS, ZERO_RAKE_POLICY } from '../contracts.js';

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

export class PokerService {
  private readonly tables = new Map<string, TableState>();
  private readonly handHistory = new Map<string, SettledHand[]>();
  private readonly tablePrivacy = new Map<string, boolean>();
  private readonly tournamentRegistrations = new Map<string, Map<string, string>>();

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
        },
      ],
    };

    if (!next.currentTurn) {
      next.currentTurn = player.id;
    }

    this.tables.set(tableId, next);
    return next;
  }

  getTable(tableId: string): TableState {
    const table = this.tables.get(tableId);
    if (!table) throw new Error('Table not found');
    return table;
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
    return next;
  }

  forceFoldForTimeout(tableId: string, playerId: string): TableState {
    return this.applyPlayerAction(tableId, playerId, 'fold', 0);
  }

  getCurrentTurn(tableId: string): string | null {
    return this.getTable(tableId).currentTurn;
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

    this.tables.set(tableId, next);
    return next;
  }

  settleHand(tableId: string): SettledHand {
    const table = this.getTable(tableId);
    const showdown = resolveShowdown(table);
    const winners = showdown.winnerIds.length > 0 ? showdown.winnerIds : table.players.map((entry) => entry.id);
    const payoutEach = winners.length > 0 ? Number((showdown.pot / winners.length).toFixed(2)) : 0;
    const payouts: SettledPayout[] = winners.map((playerId) => ({ playerId, amount: payoutEach }));

    const settled: SettledHand = {
      tableId,
      handId: `hand-${Date.now()}`,
      zeroRakePolicy: ZERO_RAKE_POLICY,
      totalPot: showdown.pot,
      rakeTaken: 0,
      payouts,
      completedAt: new Date().toISOString(),
    };

    const history = this.handHistory.get(tableId) ?? [];
    this.handHistory.set(tableId, [...history, settled]);
    return settled;
  }

  getHandHistory(tableId: string): SettledHand[] {
    return this.handHistory.get(tableId) ?? [];
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
}
