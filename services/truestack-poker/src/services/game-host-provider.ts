import type { ActionType, Card, TableState } from '../poker-engine.js';
import type { StakeLevel, TournamentListing, ZeroRakePolicy } from '../contracts.js';
import type { HandVerificationRecord } from './dealer-service.js';
import type { FeaturedTable, SettledHand, TableListing, TournamentRegistration } from './poker-service.js';

/**
 * Pluggable table-hosting boundary. `PokerService` is the default implementation:
 * an in-process engine that deals, runs the dealer brain, and settles hands itself.
 * A licensed white-label backend that runs the real game under its own gambling
 * license (see the "white label casino" model — the provider holds the license,
 * we own the brand/UX) can be swapped in later by implementing this interface.
 * Route handlers (app-server.ts) and the realtime gateway (ws-gateway.ts) only
 * ever depend on this contract, never on PokerService directly, so that swap
 * doesn't touch either of them. Mirrors the PaymentProcessor seam already used
 * for the money rail in payment-service.ts.
 */
export interface GameHostProvider {
  createCashTable(
    tableId: string,
    stakeId: string,
    players: Array<{ id: string; name: string; stack: number; isBot?: boolean }>,
    isPrivate?: boolean
  ): TableState;
  joinTable(tableId: string, player: { id: string; name: string; stack: number; isBot?: boolean }): TableState;
  /** Removes the player from the table and returns their remaining stack to their wallet. */
  cashOutPlayer(tableId: string, playerId: string): { playerId: string; amount: number };
  getTable(tableId: string): TableState;
  isPlayerSeated(tableId: string, playerId: string): boolean;

  listCashGames(filters?: { minBlind?: number; maxBlind?: number; speed?: StakeLevel['speed'] }): TableListing[];
  listFeaturedTables(limit?: number): FeaturedTable[];
  listTournaments(): TournamentListing[];
  registerTournament(tournamentId: string, userId: string): TournamentRegistration;
  listTournamentRegistrations(tournamentId: string): TournamentRegistration[];

  applyPlayerAction(tableId: string, playerId: string, type: ActionType, amount?: number): TableState;
  forceFoldForTimeout(tableId: string, playerId: string): TableState;
  getCurrentTurn(tableId: string): string | null;
  getActiveHandId(tableId: string): string | null;
  /** One player's own hole cards. Send only to the socket authenticated as that player. */
  getHoleCardsFor(tableId: string, playerId: string): Card[];

  getHandHistory(tableId: string): SettledHand[];
  getHandVerification(handId: string): HandVerificationRecord;
  getHandReplay(tableId: string, handId: string): { tableId: string; handId: string; events: HandVerificationRecord['replay'] };
  getZeroRakePolicy(): ZeroRakePolicy;

  on(event: 'hand-settled', listener: (settled: SettledHand) => void): this;
  off(event: 'hand-settled', listener: (settled: SettledHand) => void): this;
}
