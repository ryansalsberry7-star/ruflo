import { ScrollView, StyleSheet, Text, View } from 'react-native';

const protections = [
  'Server-only card generation with cryptographic RNG',
  'Verified Human badges and account-age trust signals',
  'Bot detection, multi-account linking, and collusion monitoring',
  'Transparent hand verification and replay after each hand',
  'No undisclosed AI players in real-money tables',
];

export default function FairPlayScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>TRUST CENTER</Text>
      <Text style={styles.title}>Fair Play Transparency</Text>
      <Text style={styles.subtitle}>Built to make players trust the game, not just the marketing.</Text>

      <View style={styles.promiseCard}>
        <Text style={styles.promiseTitle}>No bots. No house players. Real opponents.</Text>
        <Text style={styles.promiseBody}>
          Every hand is dealt by the server-side digital dealer. Outcomes are never controlled by clients or hidden actors.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Verified Human Poker System</Text>
        <Text style={styles.row}>• Verified Human badge</Text>
        <Text style={styles.row}>• Trust score and account age indicator</Text>
        <Text style={styles.row}>• Security verification status (email, ID, enhanced)</Text>
        <Text style={styles.row}>• Fair-play reputation based on behavior, not winnings</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Anti-Cheat Architecture</Text>
        {protections.map((item) => (
          <Text key={item} style={styles.row}>
            • {item}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How Hand Verification Works</Text>
        <Text style={styles.row}>• Dealer creates deck commitment and action timeline.</Text>
        <Text style={styles.row}>• Every action is timestamped and attached to street state.</Text>
        <Text style={styles.row}>• Completed hands remain replayable for post-game review.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 20, paddingTop: 50, gap: 12 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.8 },
  title: { color: '#F5F8FF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A6B7D9', lineHeight: 20 },
  promiseCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3979C4',
    backgroundColor: '#13284A',
    padding: 14,
    gap: 6,
  },
  promiseTitle: { color: '#F8FBFF', fontWeight: '800', fontSize: 17 },
  promiseBody: { color: '#D2E3FF', lineHeight: 19 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#263E65',
    backgroundColor: '#101A32',
    padding: 13,
    gap: 5,
  },
  cardTitle: { color: '#E9F1FF', fontSize: 15, fontWeight: '700' },
  row: { color: '#C6D8FA', lineHeight: 19 },
});
