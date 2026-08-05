import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function TermsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>LEGAL</Text>
      <Text style={styles.title}>Terms</Text>
      <Text style={styles.subtitle}>Key service boundaries for this App Store build.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Environment</Text>
        <Text style={styles.row}>• This build operates in play-money mode with virtual credits.</Text>
        <Text style={styles.row}>• Real-money wagering, cash deposits, and cash withdrawals are disabled in this environment.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Gameplay rules</Text>
        <Text style={styles.row}>• Table actions are server-authoritative and authenticated to the signed-in user.</Text>
        <Text style={styles.row}>• Replay, trust, and high-hand systems must not be used to harass other players.</Text>
        <Text style={styles.row}>• High-hand rewards are non-cash and do not come from poker pots.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Service limits</Text>
        <Text style={styles.row}>• Availability, rankings, and reward history may reset in testing or review environments.</Text>
        <Text style={styles.row}>• Any future real-money mode would require separate licensing, compliance, and regional approval.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 24, paddingTop: 56, gap: 14 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#F7FAFF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A7B5D8', lineHeight: 20 },
  card: { borderWidth: 1, borderColor: '#2D456E', borderRadius: 16, backgroundColor: '#101A33', padding: 14, gap: 8 },
  cardTitle: { color: '#EFF5FF', fontSize: 16, fontWeight: '700' },
  row: { color: '#BACCEE', lineHeight: 20 },
});
