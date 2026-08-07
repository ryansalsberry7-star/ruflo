import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CelticKnot } from '../components/CelticKnot';
import { VerifiedHumanBadge } from '../components/VerifiedHumanBadge';
import { useAuth } from '../lib/auth';
import { getJson } from '../lib/api';
import { getPlayerCharacter } from '../lib/playerIdentity';
import { colors, displayFont, fontSize } from '../lib/theme';

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
  { href: '/premium', label: 'Emerald Hand Club', caption: 'Daily & all-time rewards' },
];

export default function HomeScreen() {
  const { user, loading, logout } = useAuth();
  const [dailyLeader, setDailyLeader] = useState<HighHandEntry | null>(null);
  const activeCharacter = getPlayerCharacter(user?.playerCharacter);
  const insets = useSafeAreaInsets();

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
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <View style={styles.hero}>
        <View style={styles.heroTitleRow}>
          <CelticKnot size={26} color={colors.mint} opacity={0.85} />
          <Text style={styles.title}>EIRINN POKER</Text>
        </View>
        <Text style={styles.eyebrow}>ZERO-RAKE POKER</Text>
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
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    gap: 14,
  },
  hero: { gap: 6, marginBottom: 4 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: {
    color: colors.gold,
    fontSize: fontSize.md,
    letterSpacing: 2,
    fontWeight: '800',
  },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 0.5,
    ...displayFont,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xl,
    lineHeight: 20,
  },
  accountCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
  },
  avatarEmoji: { color: colors.text, fontSize: 24 },
  accountInfo: { flex: 1, gap: 2 },
  accountName: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  accountMeta: { color: colors.textMuted, fontSize: fontSize.lg },
  primaryButton: {
    backgroundColor: colors.gold,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 16,
  },
  primaryText: {
    color: colors.ink,
    fontSize: fontSize.xxl,
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 13,
    backgroundColor: colors.surface,
  },
  secondaryText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  textButton: { alignSelf: 'flex-start' },
  textButtonLabel: { color: colors.danger, fontSize: fontSize.lg, fontWeight: '700' },
  linkCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  linkRowLastMerged: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderBottomWidth: 0,
  },
  linkLabel: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '700' },
  linkCaption: { color: colors.textFaint, fontSize: fontSize.base, marginTop: 2 },
  linkChevron: { color: colors.textFaint, fontSize: 20, fontWeight: '700' },
  footerText: {
    color: colors.textFaint,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: 2,
  },
});
