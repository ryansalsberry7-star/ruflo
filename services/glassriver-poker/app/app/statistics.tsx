import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './lib/auth';
import { getJson } from './lib/api';

interface SessionTracker {
  averageSessionLengthMinutes: number;
  totalHands: number;
  bestSessionProfit: number;
  biggestPots: number[];
  recentTrend: Array<{ net: number }>;
}

interface SessionReview {
  biggestMistakes: string[];
  bestDecisions: string[];
  missedOpportunities: string[];
  styleAnalysis: string[];
  premium: {
    personalizedPlan: string[];
    positionLeaks: string[];
  };
}

export default function StatisticsScreen() {
  const { user, loading: authLoading } = useAuth();
  const [tracker, setTracker] = useState<SessionTracker | null>(null);
  const [review, setReview] = useState<SessionReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const activeUserId = user?.userId;
    if (!activeUserId) {
      setLoading(false);
      return;
    }

    let active = true;

    async function load(): Promise<void> {
      try {
        const [trackerResponse, reviewResponse] = await Promise.all([
          getJson<{ tracker: SessionTracker }>(`/api/session-tracker/${activeUserId}`),
          getJson<{ review: SessionReview }>(`/api/coach/${activeUserId}/session-review`),
        ]);

        if (!active) return;
        setTracker(trackerResponse.tracker);
        setReview(reviewResponse.review);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load session analytics.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [user?.userId]);

  const totalNet = useMemo(() => {
    if (!tracker) return 0;
    return tracker.recentTrend.reduce((sum, point) => sum + point.net, 0);
  }, [tracker]);

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading AI coaching insights...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Sign in to load coaching analytics.</Text>
      </View>
    );
  }

  if (error || !tracker || !review) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Session analytics unavailable.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>AI COACH</Text>
      <Text style={styles.title}>Session Review</Text>
      <Text style={styles.subtitle}>Improve faster with post-session analysis built into every game.</Text>

      <View style={styles.row}>
        <StatCard label="Session" value={`${tracker.averageSessionLengthMinutes.toFixed(1)}m avg`} />
        <StatCard label="Hands" value={String(tracker.totalHands)} />
      </View>
      <View style={styles.row}>
        <StatCard label="Net" value={`${totalNet >= 0 ? '+' : ''}$${totalNet.toFixed(2)}`} />
        <StatCard label="Biggest Pot" value={`$${(tracker.biggestPots[0] ?? 0).toFixed(2)}`} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Biggest Mistake</Text>
        <Text style={styles.panelBody}>{review.biggestMistakes[0] ?? 'No major mistake pattern detected yet.'}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Best Decision</Text>
        <Text style={styles.panelBody}>{review.bestDecisions[0] ?? 'Keep collecting hands for high-confidence highlights.'}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Missed Opportunity</Text>
        <Text style={styles.panelBody}>{review.missedOpportunities[0] ?? 'No specific missed opportunities in current sample.'}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Playing Style Analysis</Text>
        <Text style={styles.panelBody}>{review.styleAnalysis[0] ?? 'Style profile is still calibrating.'}</Text>
      </View>

      <View style={styles.tierPanel}>
        <Text style={styles.tierTitle}>Free</Text>
        <Text style={styles.tierText}>Basic session stats and top 1 leak.</Text>
        <Text style={styles.tierTitle}>Premium</Text>
        <Text style={styles.tierText}>Hand-by-hand analysis, position leaks, and personalized weekly plan.</Text>
        {review.premium.personalizedPlan.slice(0, 2).map((step) => (
          <Text key={step} style={styles.tierText}>• {step}</Text>
        ))}
        {review.premium.positionLeaks.slice(0, 1).map((leak) => (
          <Text key={leak} style={styles.tierText}>• {leak}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#060816', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#C7D8FA', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 20, paddingTop: 50, gap: 12 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.8 },
  title: { color: '#F5F8FF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A9B9DA', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#214171',
    backgroundColor: '#0E1A34',
    padding: 12,
  },
  statValue: { color: '#F8FAFF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#9EB6E0', fontSize: 12 },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#243D66',
    backgroundColor: '#111B35',
    padding: 13,
    gap: 5,
  },
  panelTitle: { color: '#EAF2FF', fontWeight: '700' },
  panelBody: { color: '#C8D9F9', lineHeight: 19 },
  tierPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3D659A',
    backgroundColor: '#16284A',
    padding: 13,
    gap: 5,
    marginBottom: 20,
  },
  tierTitle: { color: '#F8FBFF', fontWeight: '800' },
  tierText: { color: '#D0E1FF', lineHeight: 19 },
});
