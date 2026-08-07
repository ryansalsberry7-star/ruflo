import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { getJson } from '../lib/api';

interface HighHandHistoryEntry {
  handId: string;
  handName: string;
  achievedAt: string;
  tableId: string;
  points: number;
  rewards: {
    achievementTitles: string[];
  };
}

interface HighHandHighlight {
  handId: string;
  playerName: string;
  handName: string;
  tableId: string;
  achievedAt: string;
  cardsShown: string[];
  communityCards: string[];
  achievementEarned: string;
  shareText: string;
}

export default function HandVerificationScreen() {
  const { user, authToken, loading: authLoading } = useAuth();
  const [history, setHistory] = useState<HighHandHistoryEntry[]>([]);
  const [highlight, setHighlight] = useState<HighHandHighlight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const activeUserId = user?.userId;
    if (!activeUserId || !authToken) {
      setLoading(false);
      return;
    }

    let active = true;

    async function load(): Promise<void> {
      try {
        const historyResponse = await getJson<{ history: HighHandHistoryEntry[] }>(`/api/high-hands/history/${activeUserId}`, {
          headers: { authorization: `Bearer ${authToken}` },
        });
        if (!active) return;
        setHistory(historyResponse.history);

        const firstHandId = historyResponse.history[0]?.handId;
        if (!firstHandId) {
          setLoading(false);
          return;
        }

        const highlightResponse = await getJson<{ highlight: HighHandHighlight }>(`/api/high-hands/highlights/${firstHandId}`);
        if (!active) return;
        setHighlight(highlightResponse.highlight);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load high hand highlight.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [authToken, user?.userId]);

  async function shareHighlight(): Promise<void> {
    if (!highlight) return;
    await Share.share({
      message: highlight.shareText,
    });
  }

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading Emerald Hand highlight...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Sign in to view your Emerald Hand Club highlights.</Text>
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
      <Text style={styles.eyebrow}>EMERALD HAND HIGHLIGHT</Text>
      <Text style={styles.title}>{highlight?.handName ?? 'No qualifying hand yet'}</Text>
      <Text style={styles.subtitle}>Shareable highlight cards keep rare-hand moments visible without touching poker pots.</Text>

      {highlight ? (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>Player</Text>
            <Text style={styles.value}>{highlight.playerName}</Text>
            <Text style={styles.label}>Table</Text>
            <Text style={styles.value}>{highlight.tableId}</Text>
            <Text style={styles.label}>Achieved</Text>
            <Text style={styles.value}>{new Date(highlight.achievedAt).toLocaleString()}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Cards Shown</Text>
            <Text style={styles.timelineRow}>{highlight.cardsShown.join('  ')}</Text>
            <Text style={styles.sectionTitle}>Board</Text>
            <Text style={styles.timelineRow}>{highlight.communityCards.join('  ')}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Achievement Earned</Text>
            <Text style={styles.value}>{highlight.achievementEarned}</Text>
            <Text style={styles.note}>Animated replay metadata and reward history are preserved for premium high-hand sharing.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Emerald Hand History</Text>
            {history.map((entry) => (
              <Text key={entry.handId} style={styles.timelineRow}>
                • {entry.handName} • {entry.tableId} • {entry.points} pts • {entry.rewards.achievementTitles[0] ?? 'Emerald Hand Club'}
              </Text>
            ))}
          </View>

          <Pressable style={styles.button} onPress={() => void shareHighlight()}>
            <Text style={styles.buttonText}>Share Achievement</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.value}>No qualifying high hand yet. Track Full House or better to enter the Emerald Hand Club.</Text>
        </View>
      )}

      <Link href="/table" asChild>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Back to table</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#060816', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#C7D8FA', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 20, paddingTop: 48, gap: 14 },
  eyebrow: { color: '#7ED3FF', letterSpacing: 1.8, fontSize: 11, fontWeight: '700' },
  title: { color: '#F4F7FF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A8B7D8', lineHeight: 20 },
  card: {
    backgroundColor: '#101B34',
    borderWidth: 1,
    borderColor: '#28426D',
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  label: { color: '#88A7DC', fontSize: 12, fontWeight: '700' },
  value: { color: '#E9F1FF' },
  sectionTitle: { color: '#F4F7FF', fontSize: 16, fontWeight: '700' },
  timelineRow: { color: '#D6E3FF' },
  note: { color: '#8AA2CA', fontSize: 12, lineHeight: 18, marginTop: 4 },
  button: {
    backgroundColor: '#3E8FFF',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  buttonText: { color: '#FFF', fontWeight: '700' },
  secondaryButton: {
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderColor: '#486294',
    borderWidth: 1,
  },
  secondaryButtonText: { color: '#D9E7FF', fontWeight: '700' },
});
