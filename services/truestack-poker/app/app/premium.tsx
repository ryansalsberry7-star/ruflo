import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { getJson } from '../lib/api';

interface HighHandEntry {
  handId: string;
  playerName: string;
  handName: string;
  points: number;
  rewards: {
    tournamentTickets: string[];
    satelliteEntries: string[];
    cosmeticItems: string[];
    profileBadges: string[];
    achievementTitles: string[];
    clubRankingPoints: number;
  };
}

interface PremiumOverview {
  proMember: boolean;
  dailyChallenges: string[];
  exclusiveLeaderboards: string[];
  specialTournaments: string[];
  premiumAchievementBadges: string[];
  historyTracking: boolean;
}

export default function PremiumScreen() {
  const { user, authToken, loading: authLoading } = useAuth();
  const [premium, setPremium] = useState<PremiumOverview | null>(null);
  const [history, setHistory] = useState<HighHandEntry[]>([]);
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
        const [premiumResponse, historyResponse] = await Promise.all([
          getJson<{ premium: PremiumOverview }>(`/api/high-hands/premium/${activeUserId}`, {
            headers: { authorization: `Bearer ${authToken}` },
          }),
          getJson<{ history: HighHandEntry[] }>(`/api/high-hands/history/${activeUserId}`, {
            headers: { authorization: `Bearer ${authToken}` },
          }),
        ]);

        if (!active) return;
        setPremium(premiumResponse.premium);
        setHistory(historyResponse.history);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load premium high-hand data.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [authToken, user?.userId]);

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading premium Emerald Hand Club...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Sign in to load your Emerald Hand Club benefits.</Text>
      </View>
    );
  }

  if (error || !premium) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Premium data unavailable.'}</Text>
      </View>
    );
  }

  const latestReward = history[0]?.rewards;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>EMERALD HAND CLUB</Text>
      <Text style={styles.title}>Premium membership</Text>
      <Text style={styles.subtitle}>Exclusive high-hand challenges, leaderboard prestige, and zero-rake reward perks that never touch poker pots.</Text>

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>{premium.proMember ? 'Pro Emerald Hand Member' : 'Standard Member'}</Text>
        <Text style={styles.heroText}>History tracking: {premium.historyTracking ? 'Enabled' : 'Disabled'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Emerald Hand Challenges</Text>
        {premium.dailyChallenges.map((challenge) => (
          <Text key={challenge} style={styles.row}>• {challenge}</Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Exclusive Leaderboards</Text>
        {premium.exclusiveLeaderboards.map((item) => (
          <Text key={item} style={styles.row}>• {item}</Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reward Economy</Text>
        <Text style={styles.row}>Tournament tickets: {latestReward?.tournamentTickets.join(', ') || 'Earn a qualifying high hand to unlock.'}</Text>
        <Text style={styles.row}>Satellite entries: {latestReward?.satelliteEntries.join(', ') || 'No satellite entries yet.'}</Text>
        <Text style={styles.row}>Cosmetics: {latestReward?.cosmeticItems.join(', ') || 'No cosmetics awarded yet.'}</Text>
        <Text style={styles.row}>Club ranking points: {latestReward?.clubRankingPoints ?? 0}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Special Tournaments</Text>
        {premium.specialTournaments.map((item) => (
          <Text key={item} style={styles.row}>• {item}</Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Premium Badges</Text>
        {premium.premiumAchievementBadges.map((item) => (
          <Text key={item} style={styles.row}>• {item}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#060816', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#C7D8FA', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 24, paddingTop: 48, gap: 14 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A7B0CF', fontSize: 15, lineHeight: 22 },
  heroCard: {
    backgroundColor: '#172645',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3A5281',
    padding: 16,
    gap: 6,
  },
  heroTitle: { color: '#F8F7FF', fontSize: 18, fontWeight: '800' },
  heroText: { color: '#BDD1F2', fontSize: 13 },
  card: {
    backgroundColor: '#12172D',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#23304E',
    padding: 16,
    gap: 6,
  },
  cardTitle: { color: '#F8F7FF', fontSize: 16, fontWeight: '700' },
  row: { color: '#C9D4F2', fontSize: 13, lineHeight: 19 },
});
