import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { VerifiedHumanBadge } from './components/VerifiedHumanBadge';
import { useAuth } from './lib/auth';
import { getJson } from './lib/api';
import { getPlayerCharacter } from './lib/playerIdentity';

interface HighHandEntry {
  playerName: string;
  handName: string;
  tableId: string;
  points: number;
}

export default function HomeScreen() {
  const { user, loading, logout } = useAuth();
  const [dailyLeader, setDailyLeader] = useState<HighHandEntry | null>(null);
  const [allTimeLeader, setAllTimeLeader] = useState<HighHandEntry | null>(null);
  const activeCharacter = getPlayerCharacter(user?.playerCharacter);

  useEffect(() => {
    let active = true;

    async function loadLeaders(): Promise<void> {
      try {
        const response = await getJson<{ leaderboards: { day: HighHandEntry[]; allTime: HighHandEntry[] } }>('/api/high-hands/leaderboards');
        if (!active) return;
        setDailyLeader(response.leaderboards.day[0] ?? null);
        setAllTimeLeader(response.leaderboards.allTime[0] ?? null);
      } catch {
        if (!active) return;
      }
    }

    void loadLeaders();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>ZERO-RAKE POKER</Text>
        <Text style={styles.title}>TRUE STACK Poker</Text>
        <Text style={styles.subtitle}>A warmer, table-first mobile shell for fair-play poker: no house edge, no bot opponents, and no percentage taken from pots.</Text>
        <View style={styles.heroRow}>
          <View style={[styles.heroAvatar, user ? { backgroundColor: activeCharacter.aura, borderColor: activeCharacter.accent } : styles.heroAvatarIdle]}>
            <Text style={styles.heroAvatarEmoji}>{user ? activeCharacter.emoji : '\u2660'}</Text>
          </View>
          <View style={styles.heroStats}>
            <Text style={styles.heroLabel}>{user ? activeCharacter.name : 'Guest seat open'}</Text>
            <Text style={styles.heroMeta}>{user ? activeCharacter.title : 'Sign in to claim a character and trust shield.'}</Text>
            {user?.trust.verifiedHuman ? <VerifiedHumanBadge /> : null}
          </View>
        </View>
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
        {user ? (
          <Pressable style={styles.inlineButton} onPress={() => void logout()}>
            <Text style={styles.inlineButtonText}>Sign out on this device</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Live network status</Text>
        <Text style={styles.metric}>42 active tables • 516 players online</Text>
        <Text style={styles.metric}>Median action latency: 68ms</Text>
        <Text style={styles.metric}>Dealer mode: server authoritative</Text>
        <Text style={styles.metric}>Environment: play-money beta, real-money mode disabled</Text>
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Real-money account</Text>
        <Text style={styles.metric}>Identity verification, deposits, withdrawals, and responsible-gaming limits.</Text>
        <Link href="/compliance" asChild>
          <Pressable style={styles.inlineButton}>
            <Text style={styles.inlineButtonText}>Manage verification &amp; funding</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>High Hand Club</Text>
        <Text style={styles.metric}>
          Daily: {dailyLeader ? `${dailyLeader.playerName} • ${dailyLeader.handName} • ${dailyLeader.points} pts` : 'No qualifying hand yet today.'}
        </Text>
        <Text style={styles.metric}>
          All-time: {allTimeLeader ? `${allTimeLeader.playerName} • ${allTimeLeader.handName} • ${allTimeLeader.tableId}` : 'Leaderboard initializing.'}
        </Text>
        <Link href="/premium" asChild>
          <Pressable style={styles.inlineButton}>
            <Text style={styles.inlineButtonText}>Open High Hand rewards</Text>
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
        <Text style={styles.footerText}>Play-money beta • No rake • No house edge • Verified fair-play logs</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#17090D',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
    gap: 16,
  },
  heroCard: {
    gap: 10,
    backgroundColor: '#2A1118',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#5E3032',
    padding: 22,
  },
  eyebrow: {
    color: '#F1C46E',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '800',
  },
  title: {
    color: '#FFF4E7',
    fontSize: 42,
    fontWeight: '900',
  },
  subtitle: {
    color: '#D8C4BA',
    fontSize: 15,
    lineHeight: 24,
  },
  heroRow: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 4 },
  heroAvatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarIdle: {
    backgroundColor: '#3C1D26',
    borderColor: '#7A4A53',
  },
  heroAvatarEmoji: { color: '#FFF4E7', fontSize: 34 },
  heroStats: { flex: 1, gap: 4 },
  heroLabel: { color: '#FFF4E7', fontSize: 20, fontWeight: '800' },
  heroMeta: { color: '#D8C4BA', fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: '#221017',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#4B2630',
    gap: 10,
  },
  sessionCard: {
    backgroundColor: '#241319',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#6A4047',
    gap: 10,
  },
  cardTitle: {
    color: '#FFF4E7',
    fontSize: 18,
    fontWeight: '800',
  },
  metric: {
    color: '#F0DED0',
    fontSize: 14,
    lineHeight: 20,
  },
  inlineButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#7A4A53',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#3C1D26',
  },
  inlineButtonText: {
    color: '#FFF0D8',
    fontWeight: '800',
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
    backgroundColor: '#F1C46E',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryText: {
    color: '#2A1118',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    flex: 1,
    borderColor: '#7A4A53',
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#221017',
  },
  secondaryText: {
    color: '#FFF4E7',
    fontSize: 16,
    fontWeight: '700',
  },
  footerRow: {
    alignItems: 'center',
    paddingTop: 4,
  },
  footerText: {
    color: '#A98B83',
    fontSize: 12,
    textAlign: 'center',
  },
});
