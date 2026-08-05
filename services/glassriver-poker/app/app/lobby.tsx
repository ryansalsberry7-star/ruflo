import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getJson, postJson } from './lib/api';

interface TableListing {
  id: string;
  stake: {
    smallBlind: number;
    bigBlind: number;
  };
  speed: 'standard' | 'fast' | 'turbo';
  playersSeated: number;
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

const USER_ID = 'p1';

export default function LobbyScreen() {
  const [tables, setTables] = useState<TableListing[]>([]);
  const [featureTournament, setFeatureTournament] = useState<Tournament | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const [cashGames, tournaments, findMyGame] = await Promise.all([
          getJson<{ listings: TableListing[] }>('/api/lobby/cash-games'),
          getJson<{ tournaments: Tournament[] }>('/api/lobby/tournaments'),
          postJson<{ recommendations: Recommendation[] }>('/api/lobby/find-my-game', {
            userId: USER_ID,
            stakes: 'micro',
            speed: 'standard',
            tableSize: 6,
            skillLevel: 'beginner',
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
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading lobby...</Text>
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
        <Text style={styles.subtitle}>Server-dealt Hold’em cash games and tournaments.</Text>
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
            </View>
            <View style={styles.right}>
              <Text style={styles.badge}>{table.speed}</Text>
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
  centered: { flex: 1, backgroundColor: '#060816', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#C7D8FA', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 24, gap: 14 },
  header: { gap: 8, marginTop: 24 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#A4B2D4', lineHeight: 20 },
  filtersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    borderWidth: 1,
    borderColor: '#314B76',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#111D35',
  },
  filterChipActive: {
    backgroundColor: '#1A355D',
    borderColor: '#5A95E8',
  },
  filterText: { color: '#AFC3EA', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#E8F2FF' },
  tournamentBanner: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3A5281',
    backgroundColor: '#172645',
    padding: 14,
    gap: 5,
  },
  matchCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3D6BA8',
    backgroundColor: '#142848',
    padding: 14,
    gap: 7,
  },
  matchTitle: { color: '#F8FBFF', fontSize: 16, fontWeight: '800' },
  matchText: { color: '#C6D7F7', lineHeight: 19, fontSize: 13 },
  matchTags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  matchTag: {
    color: '#E5F1FF',
    backgroundColor: '#26487A',
    borderWidth: 1,
    borderColor: '#5887C8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '700',
  },
  bannerTitle: { color: '#F3F7FF', fontSize: 16, fontWeight: '800' },
  bannerMeta: { color: '#BDD1F2', fontSize: 12 },
  tableCard: {
    backgroundColor: '#12172D',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#23304E',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  left: { gap: 4 },
  right: { alignItems: 'flex-end', gap: 4 },
  tableName: { color: '#F8F7FF', fontSize: 18, fontWeight: '700' },
  detail: { color: '#A7B0CF', fontSize: 13 },
  badge: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
});
