import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './lib/auth';
import { getJson } from './lib/api';

interface SettledHand {
  handId: string;
  totalPot: number;
  payouts: Array<{ playerId: string; amount: number }>;
}

interface HandAnalysis {
  betterPlays: string[];
  strategicReasoning: string;
}

const TABLE_ID = 'cash-aurora';

export default function HandHistoryScreen() {
  const { user, authToken, loading: authLoading } = useAuth();
  const [hands, setHands] = useState<SettledHand[]>([]);
  const [analysisByHand, setAnalysisByHand] = useState<Record<string, HandAnalysis>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzingHandId, setAnalyzingHandId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const response = await getJson<{ history: SettledHand[] }>(`/api/tables/${TABLE_ID}/hand-history`);
        if (!active) return;
        setHands(response.history.slice().reverse());
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load hand history.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function analyzeHand(handId: string): Promise<void> {
    if (!user?.userId || !authToken) {
      setError('Sign in to analyze hands.');
      return;
    }

    setAnalyzingHandId(handId);
    try {
      const response = await getJson<{ analysis: HandAnalysis }>(
        `/api/coach/hands/${handId}/analyze?userId=${user.userId}&tableId=${TABLE_ID}`,
        {
          headers: { authorization: `Bearer ${authToken}` },
        }
      );
      setAnalysisByHand((current) => ({ ...current, [handId]: response.analysis }));
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Failed to analyze hand.');
    } finally {
      setAnalyzingHandId(null);
    }
  }

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading hand history...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Sign in to load hand history analysis.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>REPLAY + ANALYSIS</Text>
      <Text style={styles.title}>Hand History</Text>
      <Text style={styles.subtitle}>Replay each hand, inspect every action, and run instant strategic analysis.</Text>

      {hands.map((hand) => (
        <View key={hand.handId} style={styles.item}>
          <Text style={styles.itemTitle}>{hand.handId}</Text>
          <Text style={styles.itemMeta}>Pot ${hand.totalPot.toFixed(2)} • {hand.payouts.length} payout(s)</Text>
          <Text style={styles.itemNote}>
            {analysisByHand[hand.handId]?.betterPlays[0] ?? 'Tap Analyze This Hand for AI strategy insights.'}
          </Text>
          <View style={styles.buttonRow}>
            <Link href="/hand-verification" asChild>
              <Pressable style={styles.buttonSecondary}>
                <Text style={styles.buttonSecondaryText}>Replay Hand</Text>
              </Pressable>
            </Link>
            <Pressable style={styles.buttonPrimary} onPress={() => void analyzeHand(hand.handId)}>
              <Text style={styles.buttonPrimaryText}>
                {analyzingHandId === hand.handId ? 'Analyzing...' : 'Analyze This Hand'}
              </Text>
            </Pressable>
          </View>
          {analysisByHand[hand.handId]?.strategicReasoning ? (
            <Text style={styles.itemNote}>Strategy: {analysisByHand[hand.handId].strategicReasoning}</Text>
          ) : null}
        </View>
      ))}
      {hands.length === 0 ? (
        <View style={styles.item}>
          <Text style={styles.itemTitle}>No completed hands yet</Text>
          <Text style={styles.itemMeta}>Play a hand at the table to unlock replay and AI analysis.</Text>
        </View>
      ) : null}

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Premium Coaching</Text>
        <Text style={styles.infoBody}>Includes hand-by-hand review, probability notes, opponent range interpretation, and personalized adjustments.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#060816', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#C7D8FA', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 24, gap: 12, paddingTop: 54 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  title: { color: '#F4F7FF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#A5B4D5', lineHeight: 20, marginBottom: 6 },
  item: {
    backgroundColor: '#101A32',
    borderWidth: 1,
    borderColor: '#283E67',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  itemTitle: { color: '#F4F7FF', fontWeight: '700' },
  itemMeta: { color: '#AFC4EA' },
  itemNote: { color: '#8AC3FF', fontSize: 12 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  buttonPrimary: {
    flex: 1,
    backgroundColor: '#3E8FFF',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonPrimaryText: { color: '#FFF', fontWeight: '700' },
  buttonSecondary: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4D74AB',
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: '#D2E3FF', fontWeight: '700' },
  infoCard: {
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#325F94',
    backgroundColor: '#132541',
    padding: 14,
    gap: 5,
  },
  infoTitle: { color: '#F5F9FF', fontSize: 16, fontWeight: '700' },
  infoBody: { color: '#BDD4F8', lineHeight: 19 },
});
