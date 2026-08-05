# GlassRiver Poker

GlassRiver is a premium, zero-rake poker platform concept built as a production-grade mobile-first product. The initial implementation includes:

- a server-authoritative Hold’em engine
- an immutable wallet ledger
- a polished Expo mobile app shell for onboarding, poker lobby, table, and wallet experiences
- an architecture blueprint for future real-money, compliance, and multi-service expansion

## Architecture

- Poker Engine: table state, dealing, action handling, and showdown readiness
- Wallet Service: virtual credits, immutable ledger entries, and balance summaries
- Payment and Compliance Services: future-ready placeholders designed for real-money flows
- Mobile App: Expo + React Native screens for home, lobby, table, and wallet

## Validation

Run:

```bash
cd services/glassriver-poker
npm test
```
