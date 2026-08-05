# GlassRiver Poker

GlassRiver is a premium, zero-rake poker play-money beta built as a mobile-first product. The current implementation includes:

- a server-authoritative Hold’em engine
- an immutable wallet ledger
- a real-time WebSocket gateway for table synchronization and actions
- modular services for poker, wallet, payments, compliance, users, and analytics
- a polished Expo mobile app shell with the full phase-one screen map
- a future-ready architecture blueprint for separately licensed real-money mode

## Architecture

- Poker Engine: table state, dealing, action handling, and showdown readiness
- Dealer Service: secure deck creation/shuffle, burn/deal sequencing, showdown record generation
- Wallet Service: virtual credits, immutable ledger entries, and balance summaries
- Payment Service: transparent deposit/withdrawal fee quotes and transaction state machine
- Compliance Service: responsible gaming profile, self-exclusion, and real-money gate stubs
- User Service: profile and friend graph primitives for social features
- Analytics Service: session stats, hands/hour, pot/win tracking
- Realtime Gateway: server-authoritative WebSocket transport for actions, street updates, and hand settlement
- Mobile App: Expo + React Native screens for splash, onboarding, auth, lobby, cash games, tournaments, table, wallet, profile, social, trust center, legal, and settings

## Service Runtime

Run the realtime service:

```bash
cd services/glassriver-poker
npm start
```

The server boots with a seeded table and exposes a WebSocket endpoint at `ws://localhost:4040`.

Current environment posture:

- play-money only
- no real-money wagering enabled
- authenticated table actions required
- moderation and trust mutation routes are internal/admin-gated

### Phase 2 API Endpoints

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/logout`
- `GET /api/fair-play`
- `GET /api/lobby/cash-games`
- `GET /api/lobby/tournaments`
- `POST /api/lobby/find-my-game` (authenticated)
- `GET /api/spectator/featured-tables`
- `POST /api/tournaments/:tournamentId/register`
- `GET /api/tournaments/:tournamentId/registrations`
- `POST /api/tables/:tableId/join`
- `POST /api/tables/:tableId/action`
- `GET /api/tables/:tableId/hand-history`
- `GET /api/tables/:tableId/replay/:handId`
- `GET /api/hands/:handId/verification`
- `GET /api/wallet/:userId`
- `GET /api/high-hands/leaderboards`
- `GET /api/high-hands/history/:userId`
- `GET /api/high-hands/highlights/:handId`
- `GET /api/high-hands/premium/:userId`
- `POST /api/sessions/token`
- `POST /api/sessions/reconnect`

Realtime gameplay is available at `ws://localhost:4040/ws` with server-authoritative action handling, authenticated socket identity, and reconnect token recovery.

Turn control includes per-turn action countdown timers. If the current player does not act before timeout, the server force-folds the player and advances the turn.

### Fair Play Verification Records

Each completed hand stores a verification payload containing:

- unique hand ID and timestamps
- table ID and participating player list
- complete action timeline
- secure deck commitment hash and deck fingerprint hash
- burn/reveal sequence and final outcome
- replay event timeline for spectator and review experiences

The platform intentionally avoids claiming "provably fair" cryptographic proofs. It provides transparent server-side verification records designed for future independent auditing.

### Admin-gated moderation routes

The following routes are intended for internal operations only and should be protected with `GLASSRIVER_ADMIN_KEY` in deployment:

- `POST /api/trust/:userId/verify-human`
- `POST /api/trust/:userId/security-status`
- `POST /api/trust/:userId/anti-cheat-signal`
- `GET /api/trust/flagged`
- `POST /api/trust/collusion-assessment`

## Validation

Run:

```bash
cd services/glassriver-poker
npm test
```

Current test coverage validates:

- poker engine behavior and table progression
- zero-rake settlement guarantees
- dealer service secure dealing and fair-play verification records
- wallet ledger integrity
- payment fee transparency
- compliance real-money gating stubs
