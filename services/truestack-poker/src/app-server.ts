import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { actionEnvelopeSchema } from './contracts.js';
import { attachRealtimeGateway } from './realtime/ws-gateway.js';
import { AnalyticsService } from './services/analytics-service.js';
import { CoachService } from './services/coach-service.js';
import { ComplianceService } from './services/compliance-service.js';
import { CommunityService } from './services/community-service.js';
import { FundingService } from './services/funding-service.js';
import { HighHandService } from './services/high-hand-service.js';
import { PaymentService } from './services/payment-service.js';
import { PokerService } from './services/poker-service.js';
import { RegionalGatingService } from './services/regional-gating-service.js';
import { SessionService } from './services/session-service.js';
import { TrustService } from './services/trust-service.js';
import { UserService } from './services/user-service.js';
import { WalletService } from './services/wallet-service.js';

export interface PlatformServices {
  poker: PokerService;
  wallet: WalletService;
  payment: PaymentService;
  compliance: ComplianceService;
  regionalGating: RegionalGatingService;
  funding: FundingService;
  users: UserService;
  analytics: AnalyticsService;
  sessions: SessionService;
  trust: TrustService;
  community: CommunityService;
  coach: CoachService;
  highHands: HighHandService;
}

export interface PlatformServerOptions {
  gateway?: {
    path?: string;
    disconnectGraceMs?: number;
    turnActionMs?: number;
  };
  adminKey?: string;
}

export function buildDefaultServices(): PlatformServices {
  const highHands = new HighHandService();
  const poker = new PokerService(highHands);
  const wallet = new WalletService();
  const payment = new PaymentService();
  const realMoneyEnabled = process.env.TRUESTACK_REALMONEY_ENABLED === 'true';
  const authorizedJurisdictions = (process.env.TRUESTACK_AUTHORIZED_JURISDICTIONS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const regionalGating = new RegionalGatingService(authorizedJurisdictions);
  const compliance = new ComplianceService({ realMoneyEnabled, regionalGating });
  const funding = new FundingService(wallet, payment, compliance);
  const users = new UserService();
  const analytics = new AnalyticsService();
  const sessions = new SessionService();
  const trust = new TrustService();
  const community = new CommunityService();
  const coach = new CoachService();

  const initialUsers = [
    users.createUser('p1', 'Ada'),
    users.createUser('p2', 'Linus'),
    users.createUser('p3', 'Grace'),
  ];

  for (const user of initialUsers) {
    wallet.ensureWallet(user.id);
    trust.markVerifiedHuman(user.id);
    trust.setSecurityVerificationStatus(user.id, 'id-verified');
    community.ensureProfile(user.id, user.username);
    community.setOnlineStatus(user.id, true);
  }

  community.followPlayer('p1', 'p2');
  community.followPlayer('p1', 'p3');

  community.createClub({
    ownerId: 'p1',
    name: 'TRUE STACK Founders Club',
    description: 'Invite-only home game community focused on fair-play and study.',
    isPrivate: true,
  });

  poker.createCashTable(
    'cash-aurora',
    'micro-1',
    initialUsers.map((entry) => ({ id: entry.id, name: entry.username, stack: 1000 }))
  );

  return {
    poker,
    wallet,
    payment,
    compliance,
    regionalGating,
    funding,
    users,
    analytics,
    sessions,
    trust,
    community,
    coach,
    highHands,
  };
}

export function createPlatformServer(services: PlatformServices, options: PlatformServerOptions = {}) {
  const adminKey = options.adminKey ?? process.env.TRUESTACK_ADMIN_KEY?.trim() ?? null;
  const server = createServer(async (req, res) => {
    try {
      await routeRequest(req, res, services, adminKey);
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
      trust: services.trust,
      community: services.community,
      coach: services.coach,
    },
    path: options.gateway?.path,
    disconnectGraceMs: options.gateway?.disconnectGraceMs,
    turnActionMs: options.gateway?.turnActionMs,
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

async function routeRequest(req: IncomingMessage, res: ServerResponse, services: PlatformServices, adminKey: string | null): Promise<void> {
  const method = req.method ?? 'GET';
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  applyCorsHeaders(req, res);
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'truestack-poker',
      zeroRake: services.poker.getZeroRakePolicy(),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/auth/session') {
    const authToken = readBearerToken(req);
    const tokenSession = authToken ? services.sessions.resolveAuthToken(authToken) : null;
    if (!tokenSession) {
      sendJson(res, 200, {
        session: null,
        authToken: null,
        authTokenExpiresAt: null,
        source: 'anonymous',
      });
      return;
    }

    const currentUser = services.users.getUser(tokenSession.userId);

    sendJson(res, 200, {
      session: buildAuthSessionPayload(services, currentUser.id, currentUser.username),
      authToken: tokenSession.token,
      authTokenExpiresAt: tokenSession.expiresAt,
      source: 'stored-auth-token',
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJsonBody(req);
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';

    const user = userId
      ? services.users.hasUser(userId)
        ? services.users.getUser(userId)
        : null
      : username
        ? services.users.findByUsername(username)
        : null;

    if (!user) {
      sendJson(res, 404, { error: 'User not found. Register first or use an existing profile.' });
      return;
    }

    const authSession = services.sessions.issueAuthToken(user.id);

    sendJson(res, 200, {
      session: buildAuthSessionPayload(services, user.id, user.username),
      authToken: authSession.token,
      authTokenExpiresAt: authSession.expiresAt,
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJsonBody(req);
    const username = String(body.username ?? '').trim();
    if (!username) {
      sendJson(res, 400, { error: 'username is required' });
      return;
    }

    const requestedUserId = String(body.userId ?? '').trim();
    const userId = createAvailableUserId(services, requestedUserId || username);
    const user = services.users.createUser(userId, username);
    const requestedCharacter = typeof body.playerCharacter === 'string' ? body.playerCharacter.trim() : '';
    if (requestedCharacter) {
      services.community.setCustomization(user.id, { playerCharacter: requestedCharacter });
    }
    const authSession = services.sessions.issueAuthToken(user.id);

    sendJson(res, 200, {
      session: buildAuthSessionPayload(services, user.id, user.username),
      authToken: authSession.token,
      authTokenExpiresAt: authSession.expiresAt,
      created: true,
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const authToken = readBearerToken(req);
    if (authToken) {
      services.sessions.revokeAuthToken(authToken);
    }

    sendJson(res, 200, { ok: true });
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

  if (method === 'GET' && pathname === '/api/high-hands/leaderboards') {
    sendJson(res, 200, { leaderboards: services.highHands.getLeaderboards() });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/high-hands/history/')) {
    const userId = pathname.split('/')[4] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to personal high-hand history is required.' });
      return;
    }
    sendJson(res, 200, { userId, history: services.highHands.getUserHistory(userId) });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/high-hands/highlights/')) {
    const handId = pathname.split('/')[4] ?? '';
    sendJson(res, 200, { highlight: services.highHands.getHighlight(handId) });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/high-hands/premium/')) {
    const userId = pathname.split('/')[4] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to premium rewards is required.' });
      return;
    }
    sendJson(res, 200, { premium: services.highHands.getPremiumOverview(userId) });
    return;
  }

  if (method === 'GET' && pathname === '/api/fair-play') {
    sendJson(res, 200, {
      zeroRake: services.poker.getZeroRakePolicy(),
      dealerControl: {
        cardGeneration: 'server-only',
        shuffling: 'server-crypto-rng',
        outcomes: 'server-only',
      },
      note: 'This platform provides transparent hand verification records. It does not claim provably fair cryptographic proofs.',
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/transparency/trust-center') {
    sendJson(res, 200, {
      trustCenter: services.trust.getTrustCenterOverview(),
      fairPlay: {
        handVerification: 'enabled',
        antiCheat: ['bot-detection', 'multi-account-monitoring', 'collusion-monitoring', 'suspicious-gameplay-monitoring'],
        noHousePlayers: true,
      },
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/spectator/featured-tables') {
    sendJson(res, 200, {
      featuredTables: services.poker.listFeaturedTables(),
    });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/tournaments/') && pathname.endsWith('/registrations')) {
    const tournamentId = pathname.split('/')[3] ?? '';
    const registrations = services.poker.listTournamentRegistrations(tournamentId);
    sendJson(res, 200, { tournamentId, registrations });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/tables/') && pathname.endsWith('/hand-history')) {
    const tableId = pathname.split('/')[3] ?? '';
    sendJson(res, 200, { tableId, history: services.poker.getHandHistory(tableId) });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/tables/') && pathname.includes('/replay/')) {
    const parts = pathname.split('/');
    const tableId = parts[3] ?? '';
    const handId = parts[5] ?? '';
    const replay = services.poker.getHandReplay(tableId, handId);
    sendJson(res, 200, replay);
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/hands/') && pathname.endsWith('/verification')) {
    const handId = pathname.split('/')[3] ?? '';
    const verification = services.poker.getHandVerification(handId);
    sendJson(res, 200, { verification });
    return;
  }

  if (method === 'GET' && pathname === '/api/compliance/region') {
    const region = requestUrl.searchParams.get('region');
    const decision = services.regionalGating.evaluate(region);
    sendJson(res, 200, {
      decision,
      authorizedJurisdictions: services.regionalGating.listAuthorized(),
      note: 'Real-money play requires an operator license covering the jurisdiction. Unlisted regions are blocked.',
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/compliance/kyc/submit') {
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const fullName = String(body.fullName ?? '').trim();
    const dateOfBirth = String(body.dateOfBirth ?? '').trim();
    const jurisdiction = String(body.jurisdiction ?? '').trim();
    const documentType = String(body.documentType ?? '') as 'passport' | 'drivers-license' | 'national-id';
    if (!fullName || !dateOfBirth || !jurisdiction || !['passport', 'drivers-license', 'national-id'].includes(documentType)) {
      sendJson(res, 400, { error: 'fullName, dateOfBirth, jurisdiction, and a valid documentType are required.' });
      return;
    }
    const kyc = services.compliance.submitKyc(actor.id, { fullName, dateOfBirth, jurisdiction, documentType });
    sendJson(res, 200, { kyc });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/compliance/kyc/') && pathname.endsWith('/resolve')) {
    if (!hasAdminAccess(req, adminKey)) {
      sendJson(res, 403, { error: 'Admin authorization required.' });
      return;
    }
    const userId = pathname.split('/')[4] ?? '';
    const body = await readJsonBody(req);
    const outcome = body.outcome === 'verified' ? 'verified' : 'rejected';
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    const kyc = services.compliance.resolveKyc(userId, outcome, reason);
    sendJson(res, 200, { kyc });
    return;
  }

  if (method === 'POST' && pathname === '/api/compliance/self-exclude') {
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const profile = services.compliance.setSelfExclusion(actor.id, Boolean(body.enabled ?? true));
    sendJson(res, 200, { profile });
    return;
  }

  if (method === 'POST' && pathname === '/api/compliance/limits') {
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const profile = services.compliance.setResponsibleGamingLimits(actor.id, {
      maxDailyDeposit: typeof body.maxDailyDeposit === 'number' ? body.maxDailyDeposit : undefined,
      maxSessionMinutes: typeof body.maxSessionMinutes === 'number' ? body.maxSessionMinutes : undefined,
    });
    sendJson(res, 200, { profile });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/compliance/status/')) {
    const userId = pathname.split('/')[4] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to compliance status is required.' });
      return;
    }
    const jurisdiction = requestUrl.searchParams.get('jurisdiction');
    sendJson(res, 200, {
      decision: services.compliance.getDecision(userId, { jurisdiction }),
      kyc: services.compliance.getKycProfile(userId),
      responsibleGaming: services.compliance.getResponsibleGamingProfile(userId),
    });
    return;
  }

  if (method === 'POST' && pathname === '/api/wallet/deposit') {
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const result = await services.funding.deposit({
      accountId: actor.id,
      amount: Number(body.amount ?? 0),
      mode: body.mode === 'instant' ? 'instant' : 'standard',
      jurisdiction: typeof body.jurisdiction === 'string' ? body.jurisdiction : null,
    });
    if (!result.ok) {
      sendJson(res, result.code === 'compliance-blocked' ? 403 : 402, { error: result.code, reasons: result.reasons });
      return;
    }
    sendJson(res, 200, { wallet: result.wallet, transaction: result.transaction });
    return;
  }

  if (method === 'POST' && pathname === '/api/wallet/withdraw') {
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const result = await services.funding.withdraw({
      accountId: actor.id,
      amount: Number(body.amount ?? 0),
      mode: body.mode === 'instant' ? 'instant' : 'standard',
      jurisdiction: typeof body.jurisdiction === 'string' ? body.jurisdiction : null,
    });
    if (!result.ok) {
      sendJson(res, result.code === 'compliance-blocked' ? 403 : 402, { error: result.code, reasons: result.reasons });
      return;
    }
    sendJson(res, 200, { wallet: result.wallet, transaction: result.transaction });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/wallet/')) {
    const userId = pathname.split('/')[3] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to wallet data is required.' });
      return;
    }
    sendJson(res, 200, { wallet: services.wallet.getWallet(userId) });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/trust/') && pathname.split('/').length === 4) {
    const userId = pathname.split('/')[3] ?? '';
    const trust = services.trust.getPlayerTrust(userId);
    sendJson(res, 200, { trust });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/trust/') && pathname.endsWith('/verify-human')) {
    if (!hasAdminAccess(req, adminKey)) {
      sendJson(res, 403, { error: 'Admin authorization required.' });
      return;
    }
    const userId = pathname.split('/')[3] ?? '';
    const trust = services.trust.markVerifiedHuman(userId);
    sendJson(res, 200, { trust });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/trust/') && pathname.endsWith('/security-status')) {
    if (!hasAdminAccess(req, adminKey)) {
      sendJson(res, 403, { error: 'Admin authorization required.' });
      return;
    }
    const userId = pathname.split('/')[3] ?? '';
    const body = await readJsonBody(req);
    const status = String(body.status ?? 'unverified') as 'unverified' | 'email-verified' | 'id-verified' | 'enhanced';
    const trust = services.trust.setSecurityVerificationStatus(userId, status);
    sendJson(res, 200, { trust });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/trust/') && pathname.endsWith('/anti-cheat-signal')) {
    if (!hasAdminAccess(req, adminKey)) {
      sendJson(res, 403, { error: 'Admin authorization required.' });
      return;
    }
    const userId = pathname.split('/')[3] ?? '';
    const body = await readJsonBody(req);
    const category = String(body.category ?? 'suspicious-timing') as
      | 'bot-pattern'
      | 'multi-account'
      | 'collusion'
      | 'suspicious-timing'
      | 'chip-dumping';
    const severity = String(body.severity ?? 'medium') as 'low' | 'medium' | 'high';
    const detail = String(body.detail ?? 'Flagged by trust monitor.');
    const trust = services.trust.recordAntiCheatSignal({ userId, category, severity, detail });
    sendJson(res, 200, { trust });
    return;
  }

  if (method === 'GET' && pathname === '/api/trust/flagged') {
    if (!hasAdminAccess(req, adminKey)) {
      sendJson(res, 403, { error: 'Admin authorization required.' });
      return;
    }
    const minSignals = Number(requestUrl.searchParams.get('minSignals') ?? '2');
    sendJson(res, 200, { flagged: services.trust.listFlaggedPlayers(Number.isFinite(minSignals) ? minSignals : 2) });
    return;
  }

  if (method === 'POST' && pathname === '/api/trust/collusion-assessment') {
    if (!hasAdminAccess(req, adminKey)) {
      sendJson(res, 403, { error: 'Admin authorization required.' });
      return;
    }
    const body = await readJsonBody(req);
    const assessment = services.trust.assessCollusion({
      userA: String(body.userA ?? ''),
      userB: String(body.userB ?? ''),
      sharedTables: Number(body.sharedTables ?? 0),
      mirroredDecisionRate: Number(body.mirroredDecisionRate ?? 0),
      chipTransferBias: Number(body.chipTransferBias ?? 0),
    });
    sendJson(res, 200, { assessment });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/profiles/') && pathname.endsWith('/follow')) {
    const userId = pathname.split('/')[3] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to follow players is required.' });
      return;
    }
    const body = await readJsonBody(req);
    const targetUserId = String(body.targetUserId ?? '');
    const profile = services.community.followPlayer(userId, targetUserId);
    sendJson(res, 200, { profile });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/profiles/') && pathname.endsWith('/customization')) {
    const userId = pathname.split('/')[3] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to profile customization is required.' });
      return;
    }
    const body = await readJsonBody(req);
    const customizationUpdate: Partial<ReturnType<typeof services.community.getProfile>['customization']> = {};
    if (typeof body.cardBack === 'string') customizationUpdate.cardBack = body.cardBack;
    if (typeof body.tableTheme === 'string') customizationUpdate.tableTheme = body.tableTheme;
    if (typeof body.dealerAvatar === 'string') customizationUpdate.dealerAvatar = body.dealerAvatar;
    if (typeof body.profileFrame === 'string') customizationUpdate.profileFrame = body.profileFrame;
    if (typeof body.chipDesign === 'string') customizationUpdate.chipDesign = body.chipDesign;
    if (typeof body.playerCharacter === 'string') customizationUpdate.playerCharacter = body.playerCharacter;

    const profile = services.community.setCustomization(userId, customizationUpdate);
    sendJson(res, 200, { profile });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/profiles/') && pathname.endsWith('/achievements')) {
    const userId = pathname.split('/')[3] ?? '';
    sendJson(res, 200, { achievements: services.community.listAchievements(userId) });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/profiles/') && pathname.split('/').length === 4) {
    const userId = pathname.split('/')[3] ?? '';
    sendJson(res, 200, { profile: services.community.getProfile(userId) });
    return;
  }

  if (method === 'GET' && pathname === '/api/social/clubs') {
    sendJson(res, 200, { clubs: services.community.listClubs() });
    return;
  }

  if (method === 'POST' && pathname === '/api/social/clubs') {
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const club = services.community.createClub({
      ownerId: actor.id,
      name: String(body.name ?? 'Untitled Club'),
      description: String(body.description ?? ''),
      isPrivate: Boolean(body.isPrivate ?? false),
    });
    sendJson(res, 200, { club });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/social/clubs/') && pathname.endsWith('/join')) {
    const clubId = pathname.split('/')[4] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const userId = actor.id;
    const club = services.community.joinClub(clubId, userId);
    sendJson(res, 200, { club });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/session-tracker/')) {
    const userId = pathname.split('/')[3] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to session analytics is required.' });
      return;
    }
    sendJson(res, 200, { tracker: services.community.getSessionTracker(userId) });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/coach/') && pathname.endsWith('/session-review')) {
    const userId = pathname.split('/')[3] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to coaching review is required.' });
      return;
    }
    sendJson(res, 200, { review: services.coach.generateSessionReview(userId) });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/coach/hands/') && pathname.endsWith('/analyze')) {
    const handId = pathname.split('/')[4] ?? '';
    const userId = String(requestUrl.searchParams.get('userId') ?? '');
    const tableId = String(requestUrl.searchParams.get('tableId') ?? '');
    const actor = readAuthenticatedUser(req, services);
    if (!actor || actor.id !== userId) {
      sendJson(res, 403, { error: 'Authorized access to hand analysis is required.' });
      return;
    }
    if (!userId || !tableId) {
      sendJson(res, 400, { error: 'userId and tableId are required query params' });
      return;
    }

    const replay = services.poker.getHandReplay(tableId, handId);
    const verification = services.poker.getHandVerification(replay.handId);
    const analysis = services.coach.analyzeHandForPlayer(userId, verification);
    sendJson(res, 200, { analysis });
    return;
  }

  if (method === 'GET' && pathname === '/api/poker-academy/modules') {
    sendJson(res, 200, { modules: services.community.getAcademyModules() });
    return;
  }

  if (method === 'GET' && pathname === '/api/cosmetics/catalog') {
    sendJson(res, 200, { catalog: services.community.getCosmeticCatalog() });
    return;
  }

  if (method === 'POST' && pathname === '/api/lobby/find-my-game') {
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const userId = actor.id;
    const stakePreference = String(body.stakes ?? 'all');
    const speedPreference = String(body.speed ?? 'all');
    const tableSizePreference = Number(body.tableSize ?? 6);
    const skillLevel = String(body.skillLevel ?? 'intermediate');

    const profile = services.community.getProfile(userId);
    const listings = services.poker.listCashGames();
    const recommendations = listings
      .filter((listing) => !listing.isPrivate)
      .map((listing) => {
        let fit = 50;
        if (speedPreference !== 'all' && listing.speed === speedPreference) fit += 15;
        if (stakePreference === 'micro' && listing.stake.bigBlind <= 0.1) fit += 20;
        if (stakePreference === 'low' && listing.stake.bigBlind > 0.1 && listing.stake.bigBlind <= 2) fit += 20;
        if (stakePreference === 'mid' && listing.stake.bigBlind > 2 && listing.stake.bigBlind <= 10) fit += 20;
        if (stakePreference === 'high' && listing.stake.bigBlind > 10) fit += 20;
        fit += Math.max(0, 10 - Math.abs(tableSizePreference - listing.playersSeated));
        if (skillLevel === 'beginner' && listing.stake.bigBlind <= 2) fit += 10;
        if (skillLevel === 'pro' && listing.stake.bigBlind >= 5) fit += 10;
        if (profile.level <= 3 && listing.stake.bigBlind <= 2) fit += 8;

        return {
          tableId: listing.id,
          stake: `$${listing.stake.smallBlind}/$${listing.stake.bigBlind}`,
          speed: listing.speed,
          playersSeated: listing.playersSeated,
          fitScore: Math.min(99, fit),
          reason:
            listing.stake.bigBlind <= 2
              ? 'Good for volume and fundamentals.'
              : 'Higher-skill table with stronger decision depth.',
        };
      })
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 3);

    sendJson(res, 200, {
      userId,
      recommendations,
      note: 'Find My Game suggests tables by stakes, speed, skill fit, and active seats.',
    });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/tables/') && pathname.endsWith('/join')) {
    const tableId = pathname.split('/')[3] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const userId = actor.id;
    const username = actor.username;
    const buyIn = Number(body.buyIn ?? 0);
    if (!Number.isFinite(buyIn) || buyIn < 0) {
      sendJson(res, 400, { error: 'buyIn must be a non-negative number.' });
      return;
    }

    services.users.createUser(userId, username);
    services.trust.ensurePlayer(userId);
    services.community.ensureProfile(userId, username);

    // In real-money mode a seat requires a passing compliance decision (KYC + region + RG).
    if (services.compliance.isRealMoneyEnabled()) {
      const jurisdiction = typeof body.jurisdiction === 'string' ? body.jurisdiction : null;
      const decision = services.compliance.getDecision(userId, { jurisdiction });
      if (!decision.canPlayRealMoney) {
        sendJson(res, 403, { error: 'compliance-blocked', reasons: decision.reasons });
        return;
      }
    }

    // Only charge a buy-in when the player is not already seated, so rejoining does not double-charge.
    const alreadySeated = services.poker.isPlayerSeated(tableId, userId);
    if (!alreadySeated && buyIn > 0) {
      try {
        services.wallet.transferForBuyIn(userId, buyIn, tableId);
      } catch (error) {
        sendJson(res, 402, { error: error instanceof Error ? error.message : 'Buy-in failed.' });
        return;
      }
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
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const userId = actor.id;
    const action = actionEnvelopeSchema.parse(body.action);
    const table = services.poker.applyPlayerAction(tableId, userId, action.type, action.amount ?? 0);
    services.coach.recordAction({
      userId,
      type: action.type,
      street: table.currentStreet,
      handId: services.poker.getActiveHandId(tableId) ?? undefined,
    });
    sendJson(res, 200, { table });
    return;
  }

  if (method === 'POST' && pathname.startsWith('/api/tournaments/') && pathname.endsWith('/register')) {
    const tournamentId = pathname.split('/')[3] ?? '';
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const userId = actor.id;
    const username = actor.username;

    services.users.createUser(userId, username);
    const registration = services.poker.registerTournament(tournamentId, userId);
    sendJson(res, 200, { registration });
    return;
  }

  if (method === 'POST' && pathname === '/api/sessions/token') {
    const actor = readAuthenticatedUser(req, services);
    if (!actor) {
      sendJson(res, 401, { error: 'Authentication required.' });
      return;
    }
    const body = await readJsonBody(req);
    const userId = actor.id;
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

function applyCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  res.setHeader('access-control-allow-origin', typeof origin === 'string' ? origin : '*');
  res.setHeader('vary', 'Origin');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'Content-Type, Authorization, X-Admin-Key');
  res.setHeader('access-control-max-age', '600');
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function buildAuthSessionPayload(services: PlatformServices, userId: string, username: string) {
  services.wallet.ensureWallet(userId);
  services.trust.ensurePlayer(userId);
  services.community.ensureProfile(userId, username);
  services.community.setOnlineStatus(userId, true);

  return {
    userId,
    username,
    trust: services.trust.getPlayerTrust(userId),
    playerCharacter: services.community.getProfile(userId).customization.playerCharacter,
  };
}

function readBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function createAvailableUserId(services: PlatformServices, raw: string): string {
  const base =
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'player';

  let candidate = base;
  let counter = 1;
  while (services.users.hasUser(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function readAuthenticatedUser(req: IncomingMessage, services: PlatformServices): { id: string; username: string } | null {
  const authToken = readBearerToken(req);
  const session = authToken ? services.sessions.resolveAuthToken(authToken) : null;
  if (!session) {
    return null;
  }

  const user = services.users.getUser(session.userId);
  return { id: user.id, username: user.username };
}

function hasAdminAccess(req: IncomingMessage, adminKey: string | null): boolean {
  if (!adminKey) return false;
  const header = req.headers['x-admin-key'];
  return typeof header === 'string' && header === adminKey;
}
