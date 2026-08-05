import { Link } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ZERO-RAKE POKER</Text>
        <Text style={styles.title}>GlassRiver</Text>
        <Text style={styles.subtitle}>Transparent play. Player-first pots. Premium fintech poker.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today’s tables</Text>
        <Text style={styles.metric}>$0.05 / $0.10 • 6 seats • 24 online</Text>
        <Text style={styles.metric}>$1 / $2 • 9 seats • 88 online</Text>
        <Text style={styles.metric}>$5 / $10 • 6 seats • 43 online</Text>
      </View>

      <View style={styles.actions}>
        <Link href="/lobby" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryText}>Enter lobby</Text>
          </Pressable>
        </Link>
        <Link href="/wallet" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryText}>Open wallet</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>No rake • No house edge • Real-time tables</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#060816',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  hero: {
    gap: 8,
  },
  eyebrow: {
    color: '#7ED3FF',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
  title: {
    color: '#F8F7FF',
    fontSize: 40,
    fontWeight: '800',
  },
  subtitle: {
    color: '#A7B0CF',
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: '#12172D',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#23304E',
    gap: 10,
  },
  cardTitle: {
    color: '#F8F7FF',
    fontSize: 18,
    fontWeight: '700',
  },
  metric: {
    color: '#BFC7E2',
    fontSize: 14,
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#3E8FFF',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderColor: '#4C5F8B',
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 16,
  },
  secondaryText: {
    color: '#F8F7FF',
    fontSize: 16,
    fontWeight: '600',
  },
  footerRow: {
    alignItems: 'center',
  },
  footerText: {
    color: '#7C8AAF',
    fontSize: 12,
    textAlign: 'center',
  },
});
