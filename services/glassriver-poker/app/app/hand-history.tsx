import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function HandHistoryScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>REPLAY CENTER</Text>
      <Text style={styles.title}>Hand History</Text>
      <Text style={styles.subtitle}>Review complete hand timelines, dealer actions, and final outcomes.</Text>

      <View style={styles.item}>
        <Text style={styles.itemTitle}>cash-aurora-1722864000-4821</Text>
        <Text style={styles.itemMeta}>Pot $60 • Pair • 3 players</Text>
      </View>

      <View style={styles.item}>
        <Text style={styles.itemTitle}>cash-aurora-1722863400-1942</Text>
        <Text style={styles.itemMeta}>Pot $112 • Two pair • 4 players</Text>
      </View>

      <Link href="/hand-verification" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Open Hand Verification</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816', padding: 24, gap: 12, paddingTop: 54 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, letterSpacing: 1.5, fontWeight: '700' },
  title: { color: '#F4F7FF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#A5B4D5', lineHeight: 20, marginBottom: 8 },
  item: {
    backgroundColor: '#101A32',
    borderWidth: 1,
    borderColor: '#283E67',
    borderRadius: 14,
    padding: 14,
  },
  itemTitle: { color: '#F4F7FF', fontWeight: '700' },
  itemMeta: { color: '#AFC4EA', marginTop: 5 },
  button: {
    marginTop: 8,
    backgroundColor: '#3E8FFF',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: { color: '#FFF', fontWeight: '700' },
});
