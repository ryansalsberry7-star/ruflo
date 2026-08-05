import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const reviewedHands = [
  {
    handId: 'cash-aurora-1722864000-4821',
    summary: 'Pot $60 • Pair • 3 players',
    note: 'AI note: River call frequency too high in this line.',
  },
  {
    handId: 'cash-aurora-1722863400-1942',
    summary: 'Pot $112 • Two pair • 4 players',
    note: 'AI note: Turn check-raise was high EV versus capped range.',
  },
];

export default function HandHistoryScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>REPLAY + ANALYSIS</Text>
      <Text style={styles.title}>Hand History</Text>
      <Text style={styles.subtitle}>Replay each hand, inspect every action, and run instant strategic analysis.</Text>

      {reviewedHands.map((hand) => (
        <View key={hand.handId} style={styles.item}>
          <Text style={styles.itemTitle}>{hand.handId}</Text>
          <Text style={styles.itemMeta}>{hand.summary}</Text>
          <Text style={styles.itemNote}>{hand.note}</Text>
          <View style={styles.buttonRow}>
            <Link href="/hand-verification" asChild>
              <Pressable style={styles.buttonSecondary}>
                <Text style={styles.buttonSecondaryText}>Replay Hand</Text>
              </Pressable>
            </Link>
            <Pressable style={styles.buttonPrimary}>
              <Text style={styles.buttonPrimaryText}>Analyze This Hand</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Premium Coaching</Text>
        <Text style={styles.infoBody}>Includes hand-by-hand review, probability notes, opponent range interpretation, and personalized adjustments.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 24, gap: 12, paddingTop: 54 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  title: { color: '#F4F7FF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#A5B4D5', lineHeight: 20, marginBottom: 6 },
  item: {
    backgroundColor: '#101A32',
    borderWidth: 1,
    borderColor: '#283E67',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  itemTitle: { color: '#F4F7FF', fontWeight: '700' },
  itemMeta: { color: '#AFC4EA' },
  itemNote: { color: '#8AC3FF', fontSize: 12 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  buttonPrimary: {
    flex: 1,
    backgroundColor: '#3E8FFF',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonPrimaryText: { color: '#FFF', fontWeight: '700' },
  buttonSecondary: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4D74AB',
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonSecondaryText: { color: '#D2E3FF', fontWeight: '700' },
  infoCard: {
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#325F94',
    backgroundColor: '#132541',
    padding: 14,
    gap: 5,
  },
  infoTitle: { color: '#F5F9FF', fontSize: 16, fontWeight: '700' },
  infoBody: { color: '#BDD4F8', lineHeight: 19 },
});
