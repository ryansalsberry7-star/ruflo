import test from 'node:test';
import assert from 'node:assert/strict';
import { ComplianceService } from '../src/services/compliance-service.js';
import { RegionalGatingService } from '../src/services/regional-gating-service.js';
import { PaymentService, type PaymentProcessor, type PaymentProcessorResult } from '../src/services/payment-service.js';
import { WalletService } from '../src/services/wallet-service.js';
import { FundingService } from '../src/services/funding-service.js';
import {
  StaticLocationVerifier,
  UnverifiedLocationVerifier,
  type VerifiedLocation,
} from '../src/services/location-verifier.js';

function verifiedAdultDob(): string {
  const dob = new Date();
  dob.setUTCFullYear(dob.getUTCFullYear() - 30);
  return dob.toISOString().slice(0, 10);
}

/** A location a provider confirmed. Stands in for a Radar/GeoComply result. */
function verifiedAt(jurisdiction: string): VerifiedLocation {
  return {
    jurisdiction,
    verified: true,
    source: 'test-provider',
    reason: `Presence confirmed in ${jurisdiction}.`,
  };
}

/** What a spoofed client claim looks like once a verifier has refused to confirm it. */
function unverifiedClaim(jurisdiction: string): VerifiedLocation {
  return {
    jurisdiction,
    verified: false,
    source: 'test-provider',
    reason: 'Presence could not be confirmed.',
  };
}

class DecliningProcessor implements PaymentProcessor {
  readonly id = 'declining';
  async charge(): Promise<PaymentProcessorResult> {
    return { ok: false, providerRef: 'declined', error: 'card declined' };
  }
  async payout(): Promise<PaymentProcessorResult> {
    return { ok: false, providerRef: 'declined', error: 'payout declined' };
  }
}

test('regional gating is default-deny and blocks unauthorized jurisdictions', () => {
  const gating = new RegionalGatingService(['US-NV', 'US-NJ']);

  assert.equal(gating.evaluate('US-CA').realMoneyAllowed, false);
  assert.equal(gating.evaluate(null).realMoneyAllowed, false);
  assert.equal(gating.evaluate('US-NV').realMoneyAllowed, true);
  assert.equal(gating.evaluate('us-nj').realMoneyAllowed, true);
});

test('disabled real-money mode keeps every real-money action blocked', () => {
  const compliance = new ComplianceService();
  const decision = compliance.getDecision('acct-disabled');

  assert.equal(decision.realMoneyEnabled, false);
  assert.equal(decision.canPlayRealMoney, false);
  assert.equal(decision.canDeposit, false);
  assert.equal(decision.canWithdraw, false);
});

test('enabled mode requires KYC + authorized region before real-money play', () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });

  // Not verified, no region → blocked.
  assert.equal(compliance.getDecision('acct-1').canPlayRealMoney, false);

  compliance.submitKyc('acct-1', {
    fullName: 'Ada Lovelace',
    dateOfBirth: verifiedAdultDob(),
    jurisdiction: 'US-CA',
    documentType: 'passport',
  });
  compliance.resolveKyc('acct-1', 'verified');

  // Verified but in an unauthorized jurisdiction (CA) → still blocked.
  assert.equal(compliance.getDecision('acct-1', { location: verifiedAt('US-CA') }).canPlayRealMoney, false);

  // Verified and in an authorized jurisdiction → allowed.
  assert.equal(compliance.getDecision('acct-1', { location: verifiedAt('US-NV') }).canPlayRealMoney, true);
});

test('an unverified location cannot authorize real-money play even in an allowed region', async () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });

  compliance.submitKyc('acct-spoof', {
    fullName: 'Spoofing Player',
    dateOfBirth: verifiedAdultDob(),
    jurisdiction: 'US-NV',
    documentType: 'passport',
  });
  compliance.resolveKyc('acct-spoof', 'verified');

  // Fully KYC-verified and claiming an authorized state -- but presence was never
  // confirmed, which is exactly the spoofed-client case. Must stay blocked.
  const spoofed = compliance.getDecision('acct-spoof', { location: unverifiedClaim('US-NV') });
  assert.equal(spoofed.canPlayRealMoney, false);
  assert.equal(spoofed.locationVerified, false);
  // The unverified claim must not leak into the decision as an authorized jurisdiction.
  assert.equal(spoofed.jurisdiction, null);

  // Omitting location entirely is likewise blocked, not treated as "no restriction".
  assert.equal(compliance.getDecision('acct-spoof').canPlayRealMoney, false);

  // The same account with confirmed presence is allowed -- proving the block above
  // came from verification, not from some other failing check.
  assert.equal(compliance.getDecision('acct-spoof', { location: verifiedAt('US-NV') }).canPlayRealMoney, true);
});

test('KYC jurisdiction alone never establishes presence', () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });

  // ID was issued in Nevada, an authorized state...
  compliance.submitKyc('acct-traveler', {
    fullName: 'Nevada Resident',
    dateOfBirth: verifiedAdultDob(),
    jurisdiction: 'US-NV',
    documentType: 'drivers-license',
  });
  compliance.resolveKyc('acct-traveler', 'verified');

  // ...but the player is physically in California right now. Where the ID was issued
  // is not where they are sitting, so real-money play must be blocked.
  const inCalifornia = compliance.getDecision('acct-traveler', { location: verifiedAt('US-CA') });
  assert.equal(inCalifornia.canPlayRealMoney, false);

  // And with no location supplied it must not silently fall back to the KYC state.
  assert.equal(compliance.getDecision('acct-traveler').canPlayRealMoney, false);
});

test('the default verifier fails closed and discards the client claim', async () => {
  const verifier = new UnverifiedLocationVerifier();
  const result = await verifier.verify({ claimedJurisdiction: 'US-NV', ip: '203.0.113.7' });

  assert.equal(result.verified, false);
  // Echoing the claim back would let a spoofed string satisfy the region check.
  assert.equal(result.jurisdiction, null);
});

test('deposits are blocked when presence cannot be confirmed', async () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });
  const wallet = new WalletService();
  const funding = new FundingService(wallet, new PaymentService(), compliance);

  compliance.submitKyc('acct-nogeo', {
    fullName: 'No Geolocation',
    dateOfBirth: verifiedAdultDob(),
    jurisdiction: 'US-NV',
    documentType: 'passport',
  });
  compliance.resolveKyc('acct-nogeo', 'verified');

  const blocked = await funding.deposit({ accountId: 'acct-nogeo', amount: 100 });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, 'compliance-blocked');
});

test('StaticLocationVerifier refuses to run in production', async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => new StaticLocationVerifier('US-NV'), /cannot be used in production/);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test('underage verified accounts cannot play real money', () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });
  const minor = new Date();
  minor.setUTCFullYear(minor.getUTCFullYear() - 18);

  compliance.submitKyc('acct-teen', {
    fullName: 'Young Player',
    dateOfBirth: minor.toISOString().slice(0, 10),
    jurisdiction: 'US-NV',
    documentType: 'drivers-license',
  });
  compliance.resolveKyc('acct-teen', 'verified');

  assert.equal(compliance.getDecision('acct-teen', { location: verifiedAt('US-NV') }).canPlayRealMoney, false);
});

test('funding deposit is blocked until compliance passes, then credits the wallet', async () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });
  const wallet = new WalletService();
  const payment = new PaymentService();
  const funding = new FundingService(wallet, payment, compliance);
  wallet.ensureWallet('acct-fund');

  const blocked = await funding.deposit({ accountId: 'acct-fund', amount: 100, location: verifiedAt('US-NV') });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, 'compliance-blocked');

  compliance.submitKyc('acct-fund', {
    fullName: 'Grace Hopper',
    dateOfBirth: verifiedAdultDob(),
    jurisdiction: 'US-NV',
    documentType: 'national-id',
  });
  compliance.resolveKyc('acct-fund', 'verified');

  const before = wallet.getWallet('acct-fund').availableChips;
  const ok = await funding.deposit({ accountId: 'acct-fund', amount: 100, location: verifiedAt('US-NV') });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.wallet.availableChips, before + 100);
    assert.equal(ok.transaction.status, 'completed');
  }
});

test('funding deposit enforces the daily deposit limit', async () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });
  const wallet = new WalletService();
  const funding = new FundingService(wallet, new PaymentService(), compliance);

  compliance.submitKyc('acct-limit', {
    fullName: 'Linus T',
    dateOfBirth: verifiedAdultDob(),
    jurisdiction: 'US-NV',
    documentType: 'passport',
  });
  compliance.resolveKyc('acct-limit', 'verified');
  compliance.setResponsibleGamingLimits('acct-limit', { maxDailyDeposit: 150 });

  const first = await funding.deposit({ accountId: 'acct-limit', amount: 150, location: verifiedAt('US-NV') });
  assert.equal(first.ok, true);

  const second = await funding.deposit({ accountId: 'acct-limit', amount: 1, location: verifiedAt('US-NV') });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, 'compliance-blocked');
});

test('withdrawals require sufficient balance and fail cleanly on processor decline', async () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });
  const wallet = new WalletService();
  const decliningFunding = new FundingService(wallet, new PaymentService(new DecliningProcessor()), compliance);
  wallet.ensureWallet('acct-wd');

  compliance.submitKyc('acct-wd', {
    fullName: 'Ada W',
    dateOfBirth: verifiedAdultDob(),
    jurisdiction: 'US-NV',
    documentType: 'passport',
  });
  compliance.resolveKyc('acct-wd', 'verified');

  const overdraw = await decliningFunding.withdraw({ accountId: 'acct-wd', amount: 999999 });
  assert.equal(overdraw.ok, false);
  if (!overdraw.ok) assert.equal(overdraw.code, 'insufficient-funds');

  const declined = await decliningFunding.withdraw({ accountId: 'acct-wd', amount: 50 });
  assert.equal(declined.ok, false);
  if (!declined.ok) assert.equal(declined.code, 'payment-failed');
});

test('self-exclusion blocks deposits and real-money play', async () => {
  const gating = new RegionalGatingService(['US-NV']);
  const compliance = new ComplianceService({ realMoneyEnabled: true, regionalGating: gating });
  const wallet = new WalletService();
  const funding = new FundingService(wallet, new PaymentService(), compliance);

  compliance.submitKyc('acct-excl', {
    fullName: 'Self Excluded',
    dateOfBirth: verifiedAdultDob(),
    jurisdiction: 'US-NV',
    documentType: 'passport',
  });
  compliance.resolveKyc('acct-excl', 'verified');
  compliance.setSelfExclusion('acct-excl', true);

  assert.equal(compliance.getDecision('acct-excl', { location: verifiedAt('US-NV') }).canPlayRealMoney, false);
  const result = await funding.deposit({ accountId: 'acct-excl', amount: 20, location: verifiedAt('US-NV') });
  assert.equal(result.ok, false);
});
