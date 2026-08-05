/**
 * Regional gating enforces where real-money play is permitted.
 *
 * Model is DEFAULT-DENY: a jurisdiction can only play real money if an operator
 * has explicitly added it to the authorized allowlist (which reflects a real
 * gaming license in that jurisdiction). Nothing is authorized out of the box.
 */

/** US states/territories that currently regulate licensed online poker. Informational only. */
export const US_REGULATED_ONLINE_POKER_STATES: readonly string[] = [
  'US-NV',
  'US-NJ',
  'US-DE',
  'US-MI',
  'US-PA',
  'US-WV',
  'US-CT',
];

export interface RegionDecision {
  jurisdiction: string | null;
  realMoneyAllowed: boolean;
  reason: string;
  regulatedMarket: boolean;
}

function normalizeJurisdiction(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

export class RegionalGatingService {
  private readonly authorized: Set<string>;

  constructor(authorizedJurisdictions: string[] = []) {
    this.authorized = new Set(
      authorizedJurisdictions
        .map((entry) => normalizeJurisdiction(entry))
        .filter((entry): entry is string => entry !== null)
    );
  }

  isAuthorized(jurisdiction: string | null | undefined): boolean {
    const normalized = normalizeJurisdiction(jurisdiction);
    if (!normalized) return false;
    return this.authorized.has(normalized);
  }

  evaluate(jurisdiction: string | null | undefined): RegionDecision {
    const normalized = normalizeJurisdiction(jurisdiction);
    const regulatedMarket = normalized ? US_REGULATED_ONLINE_POKER_STATES.includes(normalized) : false;

    if (!normalized) {
      return {
        jurisdiction: null,
        realMoneyAllowed: false,
        reason: 'No verified jurisdiction was provided. Real-money play is blocked until location is confirmed.',
        regulatedMarket,
      };
    }

    if (!this.authorized.has(normalized)) {
      return {
        jurisdiction: normalized,
        realMoneyAllowed: false,
        reason: `Real-money play is not authorized in ${normalized}. This operator holds no license covering this jurisdiction.`,
        regulatedMarket,
      };
    }

    return {
      jurisdiction: normalized,
      realMoneyAllowed: true,
      reason: `Real-money play is authorized in ${normalized}.`,
      regulatedMarket,
    };
  }

  listAuthorized(): string[] {
    return Array.from(this.authorized).sort();
  }
}
