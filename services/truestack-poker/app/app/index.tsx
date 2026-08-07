import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { VerifiedHumanBadge } from '../components/VerifiedHumanBadge';
import { useAuth } from '../lib/auth';
import { getJson } from '../lib/api';
import { getPlayerCharacter } from '../lib/playerIdentity';

interface HighHandEntry {
  playerName: string;
  handName: string;
  tableId: string;
  points: number;
}

interface QuickLink {
  href: '/fair-play' | '/compliance' | '/premium';
  label: string;
  caption: string;
}

const QUICK_LINKS: QuickLink[] = [
  { href: '/fair-play', label: 'Fair play center', caption: 'Verify any settled hand' },
  { href: '/compliance', label: 'Real-money account', caption: 'Verification & funding' },
  { href: '/premium', label: 'High Hand Club', caption: 'Daily & all-time rewards' },
];

export default function HomeScreen() {
  const { user, loading, logout } = useAuth();
  const [dailyLeader, setDailyLeader] = useState<HighHandEntry | null>(null);
  const activeCharacter = getPlayerCharacter(user?.playerCharacter);

  useEffect(() => {
    let active = true;

    async function loadLeaders(): Promise<void> {
      try {
        const response = await getJson<{ leaderboards: { day: HighHandEntry[] } }>('/api/high-hands/leaderboards');
        if (!active) return;
        setDailyLeader(response.leaderboards.day[0] ?? null);
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
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ZERO-RAKE POKER</Text>
        <Text style={styles.title}>EIRINN POKER</Text>
        <Text style={styles.subtitle}>No house edge. No cut of the pot. NLH & PLO.</Text>
      </View>

      <View style={styles.accountCard}>
        <View style={styles.accountRow}>
          <View style={[styles.avatar, user ? { backgroundColor: activeCharacter.aura, borderColor: activeCharacter.accent } : styles.avatarIdle]}>
            <Text style={styles.avatarEmoji}>{user ? activeCharacter.emoji : '♠'}</Text>
          </View>
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{loading ? 'Loading…' : user ? user.username : 'Guest'}</Text>
            <Text style={styles.accountMeta}>
              {loading ? ' ' : user ? `Trust score ${user.trust.trustScore}` : 'Sign in to play with your table identity'}
            </Text>
          </View>
          {user?.trust.verifiedHuman ? <VerifiedHumanBadge /> : null}
        </View>

        {user ? (
          <Pressable style={styles.textButton} onPress={() => void logout()}>
            <Text style={styles.textButtonLabel}>Sign out</Text>
          </Pressable>
        ) : (
          <View style={styles.row}>
            <Link href="/login" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Sign in</Text>
              </Pressable>
            </Link>
            <Link href="/register" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Create account</Text>
              </Pressable>
            </Link>
          </View>
        )}
      </View>

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

      <View style={styles.linkCard}>
        {QUICK_LINKS.map((link, index) => (
          <Link key={link.href} href={link.href} asChild>
            <Pressable style={index === QUICK_LINKS.length - 1 ? styles.linkRowLastMerged : styles.linkRow}>
              <View>
                <Text style={styles.linkLabel}>{link.label}</Text>
                <Text style={styles.linkCaption}>
                  {link.href === '/premium' && dailyLeader
                    ? `Today: ${dailyLeader.playerName} • ${dailyLeader.points} pts`
                    : link.caption}
                </Text>
              </View>
              <Text style={styles.linkChevron}>{'›'}</Text>
            </Pressable>
          </Link>
        ))}
      </View>

      <Text style={styles.footerText}>Play-money beta • Server-authoritative dealing • Verified fair-play logs</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#17090D',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    gap: 14,
  },
  hero: { gap: 6, marginBottom: 4 },
  eyebrow: {
    color: '#F1C46E',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '800',
  },
  title: {
    color: '#FFF4E7',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#B99D93',
    fontSize: 14,
    lineHeight: 20,
  },
  accountCard: {
    backgroundColor: '#221017',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#4B2630',
    gap: 14,
  },
  accountRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIdle: {
    backgroundColor: '#3C1D26',
    borderColor: '#7A4A53',
  },
  avatarEmoji: { color: '#FFF4E7', fontSize: 24 },
  accountInfo: { flex: 1, gap: 2 },
  accountName: { color: '#FFF4E7', fontSize: 17, fontWeight: '800' },
  accountMeta: { color: '#B99D93', fontSize: 13 },
  primaryButton: {
    backgroundColor: '#F1C46E',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryText: {
    color: '#2A1118',
    fontSize: 16,
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderColor: '#4B2630',
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 13,
    backgroundColor: '#221017',
  },
  secondaryText: {
    color: '#FFF4E7',
    fontSize: 14,
    fontWeight: '700',
  },
  textButton: { alignSelf: 'flex-start' },
  textButtonLabel: { color: '#D89A8E', fontSize: 13, fontWeight: '700' },
  linkCard: {
    backgroundColor: '#221017',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#4B2630',
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#341A21',
  },
  linkRowLastMerged: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 0,
  },
  linkLabel: { color: '#FFF4E7', fontSize: 15, fontWeight: '700' },
  linkCaption: { color: '#8C7069', fontSize: 12, marginTop: 2 },
  linkChevron: { color: '#7A4A53', fontSize: 20, fontWeight: '700' },
  footerText: {
    color: '#7A5F58',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
});
