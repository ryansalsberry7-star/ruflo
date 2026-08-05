import { buildDefaultServices, createPlatformServer } from './app-server.js';

const services = buildDefaultServices();
const app = createPlatformServer(services);
const targetPort = Number(process.env.PORT ?? '4040');

const startedPort = await app.start(targetPort);

console.log(`GlassRiver platform listening on http://localhost:${startedPort}`);
console.log(`Realtime gateway listening on ws://localhost:${startedPort}/ws`);
console.log('Zero-rake policy:', services.poker.getZeroRakePolicy());
console.log('Compliance snapshot for p1:', services.compliance.getDecision('p1'));
console.log('Sample instant deposit quote:', services.payment.quoteDeposit(100, 'instant'));

process.on('SIGINT', () => {
  app.stop().then(() => process.exit(0));
});
