import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { actionEnvelopeSchema } from './contracts.js';
import { attachRealtimeGateway } from './realtime/ws-gateway.js';
import { AnalyticsService } from './services/analytics-service.js';
import { ComplianceService } from './services/compliance-service.js';
import { PaymentService } from './services/payment-service.js';
import { PokerService } from './services/poker-service.js';
import { SessionService } from './services/session-service.js';
import { UserService } from './services/user-service.js';
import { WalletService } from './services/wallet-service.js';

export interface PlatformServices {
  poker: PokerService;
  wallet: WalletService;
  payment: PaymentService;
  compliance: ComplianceService;
  users: UserService;
  analytics: AnalyticsService;
  sessions: SessionService;
}

export interface PlatformServerOptions {
  gateway?: {
    path?: string;
    disconnectGraceMs?: number;
  };
}

export function buildDefaultServices(): PlatformServices {
  const poker = new PokerService();
  const wallet = new WalletService();
  const payment = new PaymentService();
  const compliance = new ComplianceService();
  const users = new UserService();
  const analytics = new AnalyticsService();
  const sessions = new SessionService();

  const initialUsers = [
    users.createUser('p1', 'Ada'),
    users.createUser('p2', 'Linus'),
    users.createUser('p3', 'Grace'),
  ];

  for (const user of initialUsers) {
    wallet.ensureWallet(user.id);
  }

  poker.createCashTable(
    'cash-aurora',
    'micro-1',
    initialUsers.map((entry) => ({ id: entry.id, name: entry.username, stack: 1000 }))
  );

  return { poker, wallet, payment, compliance, users, analytics, sessions };
}

export function createPlatformServer(services: PlatformServices, options: PlatformServerOptions = {}) {
  const server = createServer(async (req, res) => {
    try {
      await routeRequest(req, res, services);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unexpected server error' });
    }
  });

  const gateway = attachRealtimeGateway({
    server,
    services: {
      poker: services.poker,
      wallet: services.wallet,
      analytics: services.analytics,
      sessions: services.sessions,
    },
    path: options.gateway?.path,
    disconnectGraceMs: options.gateway?.disconnectGraceMs,
  });

  return {
    server,
    async start(port = 4040): Promise<number> {
      return await new Promise((resolve) => {
        server.listen(port, () => {
          const address = server.address();
          const resolvedPort = typeof address === 'object' && address ? address.port : port;
          resolve(resolvedPort);
        });
      });
    },
    async stop(): Promise<void> {
      await gateway.close();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function routeRequest(req: IncomingMessage, res: ServerResponse, services: PlatformServices): Promise<void> {
  const method = req.method ?? 'GET';
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'glassriver-poker',
      zeroRake: services.poker.getZeroRakePolicy(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/lobby/cash-games') {
    const minBlind = requestUrl.searchParams.get('minBlind');
    const maxBlind = requestUrl.searchParams.get('maxBlind');
    const speed = requestUrl.searchParams.get('speed') as 'standard' | 'fast' | 'turbo' | null;

    const listings = services.poker.listCashGames({
      minBlind: minBlind ? Number(minBlind) : undefined,
      maxBlind: maxBlind ? Number(maxBlind) : undefined,
      speed: speed ?? undefined,
    });

    sendJson(res, 200, { listings });
    return;
  }

  if (method === 'GET' && pathname === '/api/lobby/tournaments') {
    sendJson(res, 200, { tournaments: services.poker.listTournaments() });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/tables/') && pathname.endsWith('/hand-history')) {
    const tableId = pathname.split('/')[3] ?? '';
    sendJson(res, 200, { tableId, history: services.poker.getHandHistory(tableId) });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/wallet/')) {
    const userId = pathname.split('/')[3] ?? '';
    sendJson(res, 200, { wallet: services.wallet.getWallet(userId) });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/tables/') && pathname.endsWith('/join')) {
    const tableId = pathname.split('/')[3] ?? '';
    const body = await readJsonBody(req);
    const userId = String(body.userId ?? 'guest');
    const username = String(body.username ?? userId);
    const buyIn = Number(body.buyIn ?? 0);

    services.users.createUser(userId, username);
    if (buyIn > 0) {
      services.wallet.transferForBuyIn(userId, buyIn, tableId);
    } else {
      services.wallet.ensureWallet(userId);
    }

    const table = services.poker.joinTable(tableId, { id: userId, name: username, stack: Math.max(buyIn, 0) || 1000 });
    const reconnect = services.sessions.issueReconnectToken(userId, tableId);

    sendJson(res, 200, {
      table,
      reconnectToken: reconnect.token,
      reconnectTokenExpiresAt: reconnect.expiresAt,
    });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/tables/') && pathname.endsWith('/action')) {
    const tableId = pathname.split('/')[3] ?? '';
    const body = await readJsonBody(req);
    const userId = String(body.userId ?? 'guest');
    const action = actionEnvelopeSchema.parse(body.action);
    const table = services.poker.applyPlayerAction(tableId, userId, action.type, action.amount ?? 0);
    sendJson(res, 200, { table });
    return;
  }

  if (method === 'POST' && pathname === '/api/sessions/token') {
    const body = await readJsonBody(req);
    const userId = String(body.userId ?? 'guest');
    const tableId = String(body.tableId ?? '');
    if (!tableId) {
      sendJson(res, 400, { error: 'tableId is required' });
      return;
    }

    const reconnect = services.sessions.issueReconnectToken(userId, tableId);
    sendJson(res, 200, {
      reconnectToken: reconnect.token,
      reconnectTokenExpiresAt: reconnect.expiresAt,
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/sessions/reconnect') {
    const body = await readJsonBody(req);
    const reconnectToken = String(body.reconnectToken ?? '');
    const session = services.sessions.consumeReconnectToken(reconnectToken);

    sendJson(res, 200, {
      userId: session.userId,
      tableId: session.tableId,
      canResume: true,
      table: services.poker.getTable(session.tableId),
    });
    return;
  }

  sendJson(res, 404, { error: 'Route not found' });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
