import type { ActionType } from '../poker-engine.js';
import type { HandVerificationRecord } from './dealer-service.js';

export interface SessionReview {
  userId: string;
  generatedAt: string;
  summary: string;
  biggestMistakes: string[];
  bestDecisions: string[];
  missedOpportunities: string[];
  styleAnalysis: string[];
  free: {
    basicStats: {
      actionsTracked: number;
      aggressionRate: number;
      foldRate: number;
    };
  };
  premium: {
    handByHandInsights: string[];
    personalizedPlan: string[];
    positionLeaks: string[];
  };
}

export interface HandAnalysis {
  handId: string;
  userId: string;
  analyzedAt: string;
  betterPlays: string[];
  probabilityNotes: string[];
  opponentRangeRead: string[];
  strategicReasoning: string;
}

interface ActionObservation {
  at: string;
  handId?: string;
  type: ActionType;
  street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

export class CoachService {
  private readonly actionsByUser = new Map<string, ActionObservation[]>();

  recordAction(input: {
    userId: string;
    type: ActionType;
    street: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
    handId?: string;
  }): void {
    const current = this.actionsByUser.get(input.userId) ?? [];
    const next: ActionObservation = {
      at: new Date().toISOString(),
      handId: input.handId,
      type: input.type,
      street: input.street,
    };
    this.actionsByUser.set(input.userId, [...current, next].slice(-500));
  }

  generateSessionReview(userId: string): SessionReview {
    const actions = this.actionsByUser.get(userId) ?? [];
    const actionsTracked = actions.length;

    const aggressive = actions.filter((entry) => entry.type === 'bet' || entry.type === 'raise' || entry.type === 'all-in').length;
    const folds = actions.filter((entry) => entry.type === 'fold').length;
    const riverCalls = actions.filter((entry) => entry.street === 'river' && entry.type === 'call').length;
    const preflopCalls = actions.filter((entry) => entry.street === 'preflop' && entry.type === 'call').length;
    const preflopFolds = actions.filter((entry) => entry.street === 'preflop' && entry.type === 'fold').length;

    const aggressionRate = actionsTracked === 0 ? 0 : Number(((aggressive / actionsTracked) * 100).toFixed(1));
    const foldRate = actionsTracked === 0 ? 0 : Number(((folds / actionsTracked) * 100).toFixed(1));

    const biggestMistakes: string[] = [];
    if (riverCalls >= 3) {
      biggestMistakes.push('You lost the most chips by calling too often on the river.');
    }
    if (preflopFolds >= 6) {
      biggestMistakes.push('You are folding too frequently from the big blind and giving up defend spots.');
    }
    if (preflopCalls >= 6 && aggressionRate < 35) {
      biggestMistakes.push('You are playing too many weak hands preflop without enough initiative.');
    }
    if (biggestMistakes.length === 0) {
      biggestMistakes.push('No major leak was detected in this short sample. Keep collecting hands for deeper analysis.');
    }

    const bestDecisions = [
      aggressionRate >= 40 ? 'Strong pressure lines increased your fold equity in contested pots.' : 'Your patient lines helped avoid over-bluffing in marginal spots.',
      foldRate <= 45 ? 'You defended enough ranges to avoid being auto-exploited preflop.' : 'You avoided unnecessary hero-calls in medium-strength spots.',
    ];

    const missedOpportunities = [
      'Identify more turn barrels on coordinated boards where opponents capped their range.',
      'Add at least one planned bluff candidate per orbit instead of deciding under pressure.',
    ];

    const styleAnalysis = [
      aggressionRate >= 45 ? 'Style: pressure-forward and initiative-driven.' : 'Style: controlled and value-seeking.',
      foldRate >= 50 ? 'Leak risk: over-folding under late-street pressure.' : 'Leak risk: occasional sticky call tendencies in bloated pots.',
    ];

    const premiumHandByHand = [
      'Hand cluster: river bluff-catch spots are -EV when facing polarized jam sizes.',
      'Hand cluster: opening range from early position is too wide for current postflop aggression profile.',
      'Hand cluster: turn check-back frequency misses profitable thin-value bets.',
    ];

    const personalizedPlan = [
      'Week 1: Cap river bluff-catch calls to top pair+ against pot-sized bets.',
      'Week 2: Tighten early-position opens by removing weakest offsuit broadways.',
      'Week 3: Add 2-3 small turn probes per session on range-advantage boards.',
    ];

    const positionLeaks = [
      'Big blind defense target: +8% defend frequency versus min-raises.',
      'Early position leak: reduce limp/call frequency and prioritize raise-or-fold decisions.',
    ];

    const summary =
      actionsTracked === 0
        ? 'No tracked actions yet. Play a session to unlock coaching insights.'
        : `Tracked ${actionsTracked} actions. Aggression ${aggressionRate}% and fold rate ${foldRate}% define your current style.`;

    return {
      userId,
      generatedAt: new Date().toISOString(),
      summary,
      biggestMistakes,
      bestDecisions,
      missedOpportunities,
      styleAnalysis,
      free: {
        basicStats: {
          actionsTracked,
          aggressionRate,
          foldRate,
        },
      },
      premium: {
        handByHandInsights: premiumHandByHand,
        personalizedPlan,
        positionLeaks,
      },
    };
  }

  analyzeHandForPlayer(userId: string, verification: HandVerificationRecord): HandAnalysis {
    const userActions = verification.actions.filter((entry) => entry.playerId === userId);
    const sawRiverCall = userActions.some((entry) => entry.street === 'river' && entry.type === 'call' && entry.amount > 0);
    const passivePreflop = userActions.filter((entry) => entry.street === 'preflop' && entry.type === 'call').length >= 1;

    const betterPlays: string[] = [];
    if (sawRiverCall) {
      betterPlays.push('Consider folding bluff-catchers on the river against large polarized sizing without blocker advantage.');
    }
    if (passivePreflop) {
      betterPlays.push('From early and middle position, prefer raise-or-fold instead of flat-calling marginal hands.');
    }
    if (betterPlays.length === 0) {
      betterPlays.push('Your line is coherent. Keep this as a baseline hand in your study set.');
    }

    const probabilityNotes = [
      `Pot context: final pot was ${verification.result.pot.toFixed(2)} with ${verification.result.winners.length} winner(s).`,
      'Rule of thumb: call decisions become fragile when pot odds require >33% equity against value-heavy ranges.',
      'Board texture should drive bluff frequency: drier boards support thinner value, wetter boards need stronger blockers.',
    ];

    const opponentRangeRead = [
      'Preflop caller range likely weighted to medium pairs and broadways.',
      'Turn aggression usually condenses to top pair+, strong draws, and semi-bluffs.',
      'River large sizing tends to be polarized between nut value and busted-draw bluffs.',
    ];

    const strategicReasoning =
      'Use this hand to compare your chosen line against a baseline strategy: preflop range discipline, turn pressure selection, and river bluff-catch thresholds.';

    return {
      handId: verification.handId,
      userId,
      analyzedAt: new Date().toISOString(),
      betterPlays,
      probabilityNotes,
      opponentRangeRead,
      strategicReasoning,
    };
  }
}
