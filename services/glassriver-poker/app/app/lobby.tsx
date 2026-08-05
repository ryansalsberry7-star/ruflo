import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const tables = [
  { name: 'Aurora', stakes: '$0.05 / $0.10', speed: 'Fast', players: '24 online' },
  { name: 'Harbor', stakes: '$1 / $2', speed: 'Standard', players: '88 online' },
  { name: 'Summit', stakes: '$5 / $10', speed: 'Premium', players: '43 online' },
];

export default function LobbyScreen() {
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
          <Text style={styles.bannerTitle}>Weekend GlassRiver Major</Text>
          <Text style={styles.bannerMeta}>$100 entry • 220 registered • Starts in 23h</Text>
        </Pressable>
      </Link>

      <Pressable style={styles.matchCard}>
        <Text style={styles.matchTitle}>Find My Game</Text>
        <Text style={styles.matchText}>Tell us your stakes, skill level, and pace. We recommend the best active tables instantly.</Text>
        <View style={styles.matchTags}>
          <Text style={styles.matchTag}>Micro stakes</Text>
          <Text style={styles.matchTag}>Beginner-friendly</Text>
          <Text style={styles.matchTag}>6-max</Text>
        </View>
      </Pressable>

      {tables.map((table) => (
        <Link key={table.name} href="/table" asChild>
          <Pressable style={styles.tableCard}>
            <View style={styles.left}>
              <Text style={styles.tableName}>{table.name}</Text>
              <Text style={styles.detail}>{table.stakes}</Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.badge}>{table.speed}</Text>
              <Text style={styles.detail}>{table.players}</Text>
            </View>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
