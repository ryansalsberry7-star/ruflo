import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function OnboardingScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>ONBOARDING</Text>
      <Text style={styles.title}>Welcome to GlassRiver</Text>
      <Text style={styles.subtitle}>This iOS review build is a play-money beta focused on fair-play verification, poker learning, and community competition.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What this build is</Text>
        <Text style={styles.row}>• Zero-rake player-versus-player poker with virtual credits</Text>
        <Text style={styles.row}>• Server-authoritative dealing and transparent hand verification</Text>
        <Text style={styles.row}>• Coaching, achievements, high-hand rewards, and clubs</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What this build is not</Text>
        <Text style={styles.row}>• No real-money wagering in this environment</Text>
        <Text style={styles.row}>• No hidden AI opponents or house players</Text>
        <Text style={styles.row}>• No reward funding from poker pots</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Player safety</Text>
        <Text style={styles.row}>• Session auth is device-bound and restorable through secure storage</Text>
        <Text style={styles.row}>• Sensitive trust and moderation routes are internal-only</Text>
        <Text style={styles.row}>• Responsible gaming controls remain in place for future licensed environments</Text>
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
