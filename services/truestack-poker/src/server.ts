import { buildDefaultServices, createPlatformServer, SEED_USER_PASSWORD } from './app-server.js';

const services = buildDefaultServices({ persist: true });
const app = createPlatformServer(services);
const targetPort = Number(process.env.PORT ?? '4040');

const startedPort = await app.start(targetPort);

console.log(`TRUE STACK Poker platform listening on http://localhost:${startedPort}`);
console.log(`Realtime gateway listening on ws://localhost:${startedPort}/ws`);
console.log(`Seed demo accounts (Ada, Linus, Grace) password: "${SEED_USER_PASSWORD}" (set TRUESTACK_SEED_PASSWORD to override)`);
console.log('Zero-rake policy:', services.poker.getZeroRakePolicy());
console.log('Compliance snapshot for p1:', services.compliance.getDecision('p1'));
console.log('Sample instant deposit quote:', services.payment.quoteDeposit(100, 'instant'));

process.on('SIGINT', () => {
  app.stop().then(() => process.exit(0));
});
