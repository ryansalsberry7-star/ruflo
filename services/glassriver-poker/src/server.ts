import { startGateway } from './realtime/ws-gateway.js';
import { PokerService } from './services/poker-service.js';
import { WalletService } from './services/wallet-service.js';
import { PaymentService } from './services/payment-service.js';
import { ComplianceService } from './services/compliance-service.js';
import { UserService } from './services/user-service.js';
import { AnalyticsService } from './services/analytics-service.js';

const poker = new PokerService();
const wallet = new WalletService();
const payment = new PaymentService();
const compliance = new ComplianceService();
const users = new UserService();
const analytics = new AnalyticsService();

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

const { server } = startGateway({ poker, wallet, analytics }, Number(process.env.PORT ?? '4040'));

console.log('GlassRiver Poker gateway listening on ws://localhost:4040');
console.log('Zero-rake policy:', poker.getZeroRakePolicy());
console.log('Compliance snapshot for p1:', compliance.getDecision('p1'));
console.log('Sample instant deposit quote:', payment.quoteDeposit(100, 'instant'));

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
