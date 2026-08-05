# GlassRiver Poker

GlassRiver is a premium, zero-rake poker platform concept built as a production-grade mobile-first product. The initial implementation includes:

- a server-authoritative Hold’em engine
- an immutable wallet ledger
- a real-time WebSocket gateway for table synchronization and actions
- modular services for poker, wallet, payments, compliance, users, and analytics
- a polished Expo mobile app shell with the full phase-one screen map
- a future-ready architecture blueprint for legally compliant real-money mode

## Architecture

- Poker Engine: table state, dealing, action handling, and showdown readiness
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

## Validation

Run:

```bash
cd services/glassriver-poker
npm test
```

Current test coverage validates:

- poker engine behavior and table progression
- zero-rake settlement guarantees
- wallet ledger integrity
- payment fee transparency
- compliance real-money gating stubs
