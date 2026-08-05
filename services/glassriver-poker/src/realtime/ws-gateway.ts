import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { actionEnvelopeSchema } from '../contracts.js';
import { PokerService } from '../services/poker-service.js';
import { WalletService } from '../services/wallet-service.js';
import { AnalyticsService } from '../services/analytics-service.js';
import { SessionService } from '../services/session-service.js';

interface ClientSession {
  socket: WebSocket;
  userId: string;
  tableId: string | null;
}

interface GatewayServices {
  poker: PokerService;
  wallet: WalletService;
  analytics: AnalyticsService;
  sessions: SessionService;
}

interface GatewayOptions {
  server: HttpServer;
  services: GatewayServices;
  path?: string;
}

export function attachRealtimeGateway(options: GatewayOptions) {
  const { server, services, path = '/ws' } = options;
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map<WebSocket, ClientSession>();

  server.on('upgrade', (request, socket, head) => {
    if (!isUpgradePathMatch(request, path)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (websocket) => {
      wss.emit('connection', websocket, request);
    });
  });

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
            clients.set(socket, { ...session, userId: recovered.userId, tableId: recovered.tableId });
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
          clients.set(socket, { ...session, userId });
          services.wallet.ensureWallet(userId);
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
          socket.send(JSON.stringify({ event: 'table_sync', payload: { table } }));
          return;
        }

        if (message.event === 'player_action') {
          const tableId = String(message.payload?.tableId ?? '');
          const actionData = actionEnvelopeSchema.parse(message.payload?.action);
          const table = services.poker.applyPlayerAction(tableId, session.userId, actionData.type, actionData.amount ?? 0);
          broadcastTable(clients, tableId, { event: 'table_update', payload: { table } });
          return;
        }

        if (message.event === 'advance_street') {
          const tableId = String(message.payload?.tableId ?? '');
          const table = services.poker.advanceStreet(tableId);
          broadcastTable(clients, tableId, { event: 'street_update', payload: { table } });
          return;
        }

        if (message.event === 'showdown') {
          const tableId = String(message.payload?.tableId ?? '');
          const settled = services.poker.settleHand(tableId);
          for (const payout of settled.payouts) {
            services.wallet.creditWinnings(payout.playerId, payout.amount, tableId);
            services.analytics.trackHand(payout.playerId, 120, settled.totalPot, payout.amount > 0);
          }
          broadcastTable(clients, tableId, { event: 'hand_settled', payload: settled });
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
      clients.delete(socket);
    });
  });

  return { wss };
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
