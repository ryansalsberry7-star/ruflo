import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function HelpCenterScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>SUPPORT</Text>
      <Text style={styles.title}>Help center</Text>
      <Text style={styles.subtitle}>Support topics for players and App Store review.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Gameplay support</Text>
        <Text style={styles.row}>• Use Hand Verification and Replay Center to review completed hands.</Text>
        <Text style={styles.row}>• High Hand Club rewards are cosmetic or ticket-based only.</Text>
        <Text style={styles.row}>• No rake is removed from player pots.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account and safety</Text>
        <Text style={styles.row}>• Sessions are restored through device-bound secure token storage.</Text>
        <Text style={styles.row}>• Verified Human and trust signals are managed by internal moderation tools.</Text>
        <Text style={styles.row}>• Report issues through support channels before sharing sensitive account details.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Review build guidance</Text>
        <Text style={styles.row}>• This app version is a play-money beta for review and testing.</Text>
        <Text style={styles.row}>• Real-money play is disabled by compliance rules in this environment.</Text>
        <Text style={styles.row}>• Privacy, terms, and trust disclosures are available in-app.</Text>
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
