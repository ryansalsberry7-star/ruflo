import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { getJson, postJson } from '../lib/api';
import { colors } from '../lib/theme';

interface TableListing {
  id: string;
  stake: {
    smallBlind: number;
    bigBlind: number;
  };
  speed: 'standard' | 'fast' | 'turbo';
  playersSeated: number;
  variant: 'nlh' | 'plo';
  variantLabel: string;
}

interface Tournament {
  name: string;
  entryFee: number;
  registeredPlayers: number;
}

interface Recommendation {
  tableId: string;
  fitScore: number;
  reason: string;
}

export default function LobbyScreen() {
  const { user, authToken, loading: authLoading } = useAuth();
  const [tables, setTables] = useState<TableListing[]>([]);
  const [featureTournament, setFeatureTournament] = useState<Tournament | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
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
        const [cashGames, tournaments, findMyGame] = await Promise.all([
          getJson<{ listings: TableListing[] }>('/api/lobby/cash-games'),
          getJson<{ tournaments: Tournament[] }>('/api/lobby/tournaments'),
          postJson<{ recommendations: Recommendation[] }>('/api/lobby/find-my-game', {
            userId: activeUserId,
            stakes: 'micro',
            speed: 'standard',
            tableSize: 6,
            skillLevel: 'beginner',
          }, {
            headers: { authorization: `Bearer ${authToken}` },
          }),
        ]);

        if (!active) return;
        setTables(cashGames.listings);
        setFeatureTournament(tournaments.tournaments[0] ?? null);
        setRecommendations(findMyGame.recommendations);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load lobby data.');
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
        <Text style={styles.loadingText}>Loading lobby...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Sign in to get personalized table recommendations.</Text>
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
      <View style={styles.header}>
        <Text style={styles.eyebrow}>POKER LOBBY</Text>
        <Text style={styles.title}>Find your table</Text>
        <Text style={styles.subtitle}>Server-dealt No-Limit Hold’em and Pot-Limit Omaha cash games and tournaments.</Text>
      </View>

      <View style={styles.filtersRow}>
        {['All Stakes', 'Fast', 'Heads-up', 'Private'].map((filter, idx) => (
          <Pressable key={filter} style={[styles.filterChip, idx === 0 && styles.filterChipActive]}>
            <Text style={[styles.filterText, idx === 0 && styles.filterTextActive]}>{filter}</Text>
          </Pressable>
        ))}
      </View>

      <Link href="/tournaments" asChild>
        <Pressable style={styles.tournamentBanner}>
          <Text style={styles.bannerTitle}>{featureTournament?.name ?? 'Tournament Spotlight'}</Text>
          <Text style={styles.bannerMeta}>
            ${featureTournament?.entryFee ?? 0} entry • {featureTournament?.registeredPlayers ?? 0} registered
          </Text>
        </Pressable>
      </Link>

      <Pressable style={styles.matchCard}>
        <Text style={styles.matchTitle}>Find My Game</Text>
        <Text style={styles.matchText}>Tell us your stakes, skill level, and pace. We recommend the best active tables instantly.</Text>
        <View style={styles.matchTags}>
          {recommendations.map((recommendation) => (
            <Text key={recommendation.tableId} style={styles.matchTag}>
              {recommendation.tableId} ({recommendation.fitScore})
            </Text>
          ))}
          {recommendations.length === 0 ? <Text style={styles.matchTag}>No recommendation yet</Text> : null}
        </View>
        {recommendations[0]?.reason ? <Text style={styles.matchText}>{recommendations[0].reason}</Text> : null}
      </Pressable>

      {tables.map((table) => (
        <Link key={table.id} href="/table" asChild>
          <Pressable style={styles.tableCard}>
            <View style={styles.left}>
              <Text style={styles.tableName}>{table.id}</Text>
              <Text style={styles.detail}>${table.stake.smallBlind} / ${table.stake.bigBlind}</Text>
              <Text style={styles.variantLabel}>{table.variantLabel}</Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.badge}>{table.variant.toUpperCase()}</Text>
              <Text style={styles.detail}>{table.speed}</Text>
              <Text style={styles.detail}>{table.playersSeated} seated</Text>
            </View>
          </Pressable>
        </Link>
      ))}
      {tables.length === 0 ? (
        <View style={styles.tableCard}>
          <Text style={styles.detail}>No active tables at the moment.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, gap: 14 },
  header: { gap: 8, marginTop: 24 },
  eyebrow: { color: colors.gold, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.textMuted, lineHeight: 20 },
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.surfaceActive,
    borderColor: colors.gold,
  },
  filterText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: colors.text },
  tournamentBanner: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: 14,
    gap: 5,
  },
  matchCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: 14,
    gap: 7,
  },
  matchTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  matchText: { color: colors.textMuted, lineHeight: 19, fontSize: 13 },
  matchTags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  matchTag: {
    color: colors.text,
    backgroundColor: colors.surfaceActive,
    borderWidth: 1,
    borderColor: colors.goldMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '700',
  },
  bannerTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  bannerMeta: { color: colors.textMuted, fontSize: 12 },
  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  left: { gap: 4 },
  right: { alignItems: 'flex-end', gap: 4 },
  tableName: { color: colors.text, fontSize: 18, fontWeight: '700' },
  variantLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  detail: { color: colors.textMuted, fontSize: 13 },
  badge: { color: colors.gold, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
});
