import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { actionEnvelopeSchema } from '../contracts.js';
import { PokerService } from '../services/poker-service.js';
import { WalletService } from '../services/wallet-service.js';
import { AnalyticsService } from '../services/analytics-service.js';
import { CoachService } from '../services/coach-service.js';
import { CommunityService } from '../services/community-service.js';
import { SessionService } from '../services/session-service.js';
import { TrustService } from '../services/trust-service.js';

interface ClientSession {
  socket: WebSocket;
  userId: string;
  tableId: string | null;
}

interface PendingDisconnect {
  timeout: ReturnType<typeof setTimeout>;
  reconnectToken: string;
  userId: string;
  tableId: string;
}

interface GatewayServices {
  poker: PokerService;
  wallet: WalletService;
  analytics: AnalyticsService;
  sessions: SessionService;
  trust: TrustService;
  community: CommunityService;
  coach: CoachService;
}

interface GatewayOptions {
  server: HttpServer;
  services: GatewayServices;
  path?: string;
  disconnectGraceMs?: number;
  turnActionMs?: number;
}

export function attachRealtimeGateway(options: GatewayOptions) {
  const { server, services, path = '/ws', disconnectGraceMs = 15_000, turnActionMs = 20_000 } = options;
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, ClientSession>();
  const pendingDisconnects = new Map<string, PendingDisconnect>();
  const tableTurnTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const onUpgrade = (request: IncomingMessage, socket: import('node:net').Socket, head: Buffer) => {
    if (!isUpgradePathMatch(request, path)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (websocket) => {
      wss.emit('connection', websocket, request);
    });
  };

  server.on('upgrade', onUpgrade);

  wss.on('connection', (socket) => {
    clients.set(socket, { socket, userId: 'guest', tableId: null });

    socket.send(
      JSON.stringify({
        event: 'connected',
        payload: {
          message: 'Connected to GlassRiver real-time gateway.',
          serverAuthoritative: true,
        },
      })
    );

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as { event: string; payload?: Record<string, unknown> };
        const session = clients.get(socket);
        if (!session) return;

        if (message.event === 'auth') {
          const reconnectToken = typeof message.payload?.reconnectToken === 'string' ? message.payload.reconnectToken : null;
          if (reconnectToken) {
            const recovered = services.sessions.consumeReconnectToken(reconnectToken);
            clearPendingDisconnect(pendingDisconnects, makePresenceKey(recovered.userId, recovered.tableId));
            clients.set(socket, { ...session, userId: recovered.userId, tableId: recovered.tableId });
            scheduleTurnTimeout(tableTurnTimers, services, clients, recovered.tableId, turnActionMs);
            socket.send(
              JSON.stringify({
                event: 'reconnect_ok',
                payload: {
                  userId: recovered.userId,
                  tableId: recovered.tableId,
                },
              })
            );
            return;
          }

          const userId = String(message.payload?.userId ?? 'guest');
          const tableId = typeof message.payload?.tableId === 'string' ? message.payload.tableId : null;
          if (tableId) {
            clearPendingDisconnect(pendingDisconnects, makePresenceKey(userId, tableId));
          }

          clients.set(socket, { ...session, userId, tableId });
          services.wallet.ensureWallet(userId);
          services.trust.ensurePlayer(userId);
          services.community.ensureProfile(userId, userId);
          services.community.setOnlineStatus(userId, true);
          const reconnect = tableId
            ? services.sessions.issueReconnectToken(userId, tableId)
            : null;
          socket.send(
            JSON.stringify({
              event: 'auth_ok',
              payload: {
                userId,
                reconnectToken: reconnect?.token ?? null,
                reconnectTokenExpiresAt: reconnect?.expiresAt ?? null,
              },
            })
          );
          return;
        }

        if (message.event === 'subscribe_table') {
          const tableId = String(message.payload?.tableId ?? '');
          const table = services.poker.getTable(tableId);
          clients.set(socket, { ...session, tableId });
          scheduleTurnTimeout(tableTurnTimers, services, clients, tableId, turnActionMs);
          socket.send(JSON.stringify({ event: 'table_sync', payload: { table } }));
          return;
        }

        if (message.event === 'player_action') {
          const tableId = String(message.payload?.tableId ?? '');
          const actionData = actionEnvelopeSchema.parse(message.payload?.action);
          const table = services.poker.applyPlayerAction(tableId, session.userId, actionData.type, actionData.amount ?? 0);
          services.coach.recordAction({
            userId: session.userId,
            type: actionData.type,
            street: table.currentStreet,
            handId: services.poker.getActiveHandId(tableId) ?? undefined,
          });
          broadcastTable(clients, tableId, { event: 'table_update', payload: { table } });
          scheduleTurnTimeout(tableTurnTimers, services, clients, tableId, turnActionMs);
          return;
        }

        if (message.event === 'advance_street') {
          const tableId = String(message.payload?.tableId ?? '');
          const table = services.poker.advanceStreet(tableId);
          broadcastTable(clients, tableId, { event: 'street_update', payload: { table } });
          scheduleTurnTimeout(tableTurnTimers, services, clients, tableId, turnActionMs);
          return;
        }

        if (message.event === 'showdown') {
          const tableId = String(message.payload?.tableId ?? '');
          const settled = services.poker.settleHand(tableId);
          for (const payout of settled.payouts) {
            services.wallet.creditWinnings(payout.playerId, payout.amount, tableId);
            services.analytics.trackHand(payout.playerId, 120, settled.totalPot, payout.amount > 0);
            services.community.recordSessionSummary(payout.playerId, {
              durationMinutes: 20,
              handsPlayed: 1,
              netProfit: payout.amount,
              biggestPot: settled.totalPot,
            });
            services.trust.recordCompletedSession(payout.playerId, true);
          }
          broadcastTable(clients, tableId, { event: 'hand_settled', payload: settled });
          clearTableTurnTimer(tableTurnTimers, tableId);
          return;
        }

        socket.send(JSON.stringify({ event: 'error', payload: { message: 'Unknown event.' } }));
      } catch (error) {
        socket.send(
          JSON.stringify({
            event: 'error',
            payload: { message: error instanceof Error ? error.message : 'Unhandled gateway error' },
          })
        );
      }
    });

    socket.on('close', () => {
      const session = clients.get(socket);
      clients.delete(socket);

      if (!session || session.userId === 'guest' || !session.tableId) return;
      services.community.setOnlineStatus(session.userId, false);
      const reconnect = services.sessions.issueReconnectToken(session.userId, session.tableId);
      const presenceKey = makePresenceKey(session.userId, session.tableId);
      clearPendingDisconnect(pendingDisconnects, presenceKey);

      const timeout = setTimeout(() => {
        pendingDisconnects.delete(presenceKey);
        services.trust.recordAntiCheatSignal({
          userId: session.userId,
          category: 'suspicious-timing',
          severity: 'low',
          detail: 'Missed reconnect grace period; auto-fold was enforced.',
        });
        const table = services.poker.forceFoldForTimeout(session.tableId as string, session.userId);
        broadcastTable(clients, session.tableId as string, {
          event: 'player_timed_out',
          payload: { userId: session.userId, tableId: session.tableId },
        });
        broadcastTable(clients, session.tableId as string, { event: 'table_update', payload: { table } });
        scheduleTurnTimeout(tableTurnTimers, services, clients, session.tableId as string, turnActionMs);
      }, disconnectGraceMs);

      pendingDisconnects.set(presenceKey, {
        timeout,
        reconnectToken: reconnect.token,
        userId: session.userId,
        tableId: session.tableId,
      });

      broadcastTable(clients, session.tableId, {
        event: 'player_disconnected',
        payload: {
          userId: session.userId,
          tableId: session.tableId,
          reconnectToken: reconnect.token,
          reconnectTokenExpiresAt: reconnect.expiresAt,
          graceMs: disconnectGraceMs,
        },
      });
    });
  });

  return {
    wss,
    close: async () => {
      server.off('upgrade', onUpgrade);
      for (const pending of pendingDisconnects.values()) {
        clearTimeout(pending.timeout);
      }
      pendingDisconnects.clear();

      for (const timer of tableTurnTimers.values()) {
        clearTimeout(timer);
      }
      tableTurnTimers.clear();

      for (const session of clients.values()) {
        if (session.socket.readyState === session.socket.OPEN) {
          session.socket.close();
        }
      }
      clients.clear();

      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
}

function makePresenceKey(userId: string, tableId: string): string {
  return `${tableId}:${userId}`;
}

function clearPendingDisconnect(pendingDisconnects: Map<string, PendingDisconnect>, key: string): void {
  const pending = pendingDisconnects.get(key);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingDisconnects.delete(key);
}

function clearTableTurnTimer(tableTurnTimers: Map<string, ReturnType<typeof setTimeout>>, tableId: string): void {
  const timer = tableTurnTimers.get(tableId);
  if (!timer) return;
  clearTimeout(timer);
  tableTurnTimers.delete(tableId);
}

function scheduleTurnTimeout(
  tableTurnTimers: Map<string, ReturnType<typeof setTimeout>>,
  services: GatewayServices,
  clients: Map<WebSocket, ClientSession>,
  tableId: string,
  turnActionMs: number
): void {
  clearTableTurnTimer(tableTurnTimers, tableId);

  const currentTurn = services.poker.getCurrentTurn(tableId);
  if (!currentTurn) return;

  const expiresAt = Date.now() + turnActionMs;
  broadcastTable(clients, tableId, {
    event: 'turn_timer_started',
    payload: { tableId, currentTurn, turnActionMs, expiresAt },
  });

  const timer = setTimeout(() => {
    tableTurnTimers.delete(tableId);
    const actingPlayer = services.poker.getCurrentTurn(tableId);
    if (!actingPlayer) return;

    const table = services.poker.forceFoldForTimeout(tableId, actingPlayer);
    broadcastTable(clients, tableId, {
      event: 'turn_action_timed_out',
      payload: { tableId, userId: actingPlayer },
    });
    broadcastTable(clients, tableId, { event: 'table_update', payload: { table } });
    scheduleTurnTimeout(tableTurnTimers, services, clients, tableId, turnActionMs);
  }, turnActionMs);

  tableTurnTimers.set(tableId, timer);
}

function isUpgradePathMatch(request: IncomingMessage, path: string): boolean {
  const incomingUrl = request.url ?? '';
  const pathname = incomingUrl.split('?')[0] ?? '';
  return pathname === path;
}

function broadcastTable(
  clients: Map<WebSocket, ClientSession>,
  tableId: string,
  message: { event: string; payload: unknown }
): void {
  for (const session of clients.values()) {
    if (session.tableId !== tableId) continue;
    if (session.socket.readyState !== session.socket.OPEN) continue;
    session.socket.send(JSON.stringify(message));
  }
}
