import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './lib/auth';

export default function HomeScreen() {
  const { user, loading } = useAuth();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ZERO-RAKE POKER</Text>
        <Text style={styles.title}>GlassRiver</Text>
        <Text style={styles.subtitle}>No house edge. No percentage from pots. Premium dealer-led table experience.</Text>
      </View>

      <View style={styles.sessionCard}>
        <Text style={styles.cardTitle}>Active player</Text>
        <Text style={styles.metric}>{loading ? 'Loading session...' : user ? `${user.username} (${user.userId})` : 'No active session'}</Text>
        <Text style={styles.metric}>{user ? `Trust score ${user.trust.trustScore} • ${user.trust.verifiedHuman ? 'Verified Human' : 'Unverified'}` : 'Sign in or create an account to personalize coaching and matchmaking.'}</Text>
        <View style={styles.row}>
          <Link href="/login" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Login</Text>
            </Pressable>
          </Link>
          <Link href="/register" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Register</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Live network status</Text>
        <Text style={styles.metric}>42 active tables • 516 players online</Text>
        <Text style={styles.metric}>Median action latency: 68ms</Text>
        <Text style={styles.metric}>Dealer mode: server authoritative</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trust center</Text>
        <Text style={styles.metric}>Hand verification available after every settled hand.</Text>
        <Link href="/fair-play" asChild>
          <Pressable style={styles.inlineButton}>
            <Text style={styles.inlineButtonText}>Open fair play center</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.actions}>
        <Link href="/lobby" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryText}>Enter poker lobby</Text>
          </Pressable>
        </Link>
        <View style={styles.row}>
          <Link href="/wallet" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Wallet</Text>
            </Pressable>
          </Link>
          <Link href="/table" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Quick seat</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>No rake • No house edge • Verified fair-play logs</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#060816',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 58,
    paddingBottom: 24,
    gap: 14,
  },
  hero: {
    gap: 8,
    marginBottom: 4,
  },
  eyebrow: {
    color: '#7ED3FF',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
  title: {
    color: '#F8F7FF',
    fontSize: 42,
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
  sessionCard: {
    backgroundColor: '#11213E',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#315C97',
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
    lineHeight: 20,
  },
  inlineButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#486294',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#1A2744',
  },
  inlineButtonText: {
    color: '#D9E7FF',
    fontWeight: '700',
    fontSize: 12,
  },
  actions: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
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
    flex: 1,
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
    paddingTop: 4,
  },
  footerText: {
    color: '#7C8AAF',
    fontSize: 12,
    textAlign: 'center',
  },
});
