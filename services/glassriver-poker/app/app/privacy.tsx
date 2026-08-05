import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>LEGAL</Text>
      <Text style={styles.title}>Privacy</Text>
      <Text style={styles.subtitle}>This screen summarizes what the play-money beta stores and why.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Data collected</Text>
        <Text style={styles.row}>• Account identity: username, internal player ID, session token</Text>
        <Text style={styles.row}>• Gameplay telemetry: actions, hand history, timing, achievements, high-hand highlights</Text>
        <Text style={styles.row}>• Trust signals: verification status, suspicious activity flags, moderation records</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Why data is used</Text>
        <Text style={styles.row}>• To restore your session securely across app restarts</Text>
        <Text style={styles.row}>• To run fair-play reviews, coaching summaries, and player progression</Text>
        <Text style={styles.row}>• To support optional sharing of rare-hand achievements</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What this build does not do</Text>
        <Text style={styles.row}>• No third-party ad tracking is implemented here</Text>
        <Text style={styles.row}>• No real-money payment processing is active in this environment</Text>
        <Text style={styles.row}>• Sensitive moderation tools are not exposed to public clients</Text>
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
