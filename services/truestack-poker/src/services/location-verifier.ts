/**
 * Verified-presence boundary for real-money gating.
 *
 * Gambling authorization turns on where the player physically IS at the moment
 * they play -- not where they say they are, and not where their ID was issued.
 * A jurisdiction string taken from a request body is a claim, not evidence: any
 * client can send `{"jurisdiction":"US-NV"}`. Nothing in this file trusts one.
 *
 * A LocationVerifier converts raw evidence (client IP, an attestation token from
 * a device-side geolocation SDK) into a VerifiedLocation that ComplianceService
 * will accept. The production implementations are vendor-backed -- Radar or
 * GeoComply, the latter being the US regulated-gaming standard -- and plug in
 * here without touching the compliance rules. Mirrors the PaymentProcessor and
 * GameHostProvider seams.
 */

export interface LocationEvidence {
  /** What the client says its jurisdiction is. ADVISORY ONLY -- never sufficient to authorize play. */
  claimedJurisdiction?: string | null;
  /** Client IP as observed by the server (not by the client). */
  ip?: string | null;
  /** Opaque attestation token produced by a device-side geolocation SDK. */
  attestationToken?: string | null;
}

export interface VerifiedLocation {
  /** Resolved jurisdiction (e.g. 'US-NV'), or null when it could not be established. */
  jurisdiction: string | null;
  /** True only when a provider actually confirmed physical presence. Real-money gating requires this. */
  verified: boolean;
  /** Which provider produced this result, for audit trails. */
  source: string;
  reason: string;
}

export interface LocationVerifier {
  readonly id: string;
  verify(evidence: LocationEvidence): Promise<VerifiedLocation>;
}

export function normalizeJurisdiction(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Default verifier: confirms nothing, so real-money play fails closed.
 *
 * It deliberately discards `claimedJurisdiction` rather than passing it through.
 * Echoing the client's own claim back as a result would let an unverified string
 * satisfy the compliance check -- exactly the hole this seam exists to close.
 */
export class UnverifiedLocationVerifier implements LocationVerifier {
  readonly id = 'unverified';

  async verify(_evidence: LocationEvidence): Promise<VerifiedLocation> {
    return {
      jurisdiction: null,
      verified: false,
      source: this.id,
      reason:
        'No geolocation provider is configured, so physical presence cannot be confirmed. Real-money play is blocked.',
    };
  }
}

/**
 * Test/development verifier that trusts a jurisdiction handed to it directly.
 *
 * This exists so real-money flows can be exercised without a vendor account. It
 * verifies NOTHING and must never authorize real players, so it refuses to
 * construct under NODE_ENV=production.
 */
export class StaticLocationVerifier implements LocationVerifier {
  readonly id = 'static-development-only';
  private readonly jurisdiction: string | null;

  constructor(jurisdiction: string | null) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'StaticLocationVerifier cannot be used in production: it fabricates location evidence. Configure a real geolocation provider.'
      );
    }
    this.jurisdiction = normalizeJurisdiction(jurisdiction);
  }

  async verify(_evidence: LocationEvidence): Promise<VerifiedLocation> {
    return {
      jurisdiction: this.jurisdiction,
      verified: this.jurisdiction !== null,
      source: this.id,
      reason: `Development-only static location (${this.jurisdiction ?? 'none'}). Not real evidence of presence.`,
    };
  }
}

/** Location value used when no verification was attempted at all. Always blocked. */
export const UNVERIFIED_LOCATION: VerifiedLocation = {
  jurisdiction: null,
  verified: false,
  source: 'none',
  reason: 'No location verification was attempted.',
};
