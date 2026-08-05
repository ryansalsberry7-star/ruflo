import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './lib/auth';
import { getJson } from './lib/api';

interface PlayerProfile {
  userId: string;
  username: string;
  favoriteGames: string[];
  handsPlayed: number;
  winStreak: number;
  level: number;
  badges: string[];
  tournamentHistory: Array<{
    tournamentId: string;
    placement: number;
    prize: number;
  }>;
}

interface TrustSnapshot {
  verifiedHuman: boolean;
  trustScore: number;
  accountAgeDays: number;
  securityVerificationStatus: string;
}

interface Achievement {
  id: string;
  title: string;
}

export default function ProfileScreen() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [trust, setTrust] = useState<TrustSnapshot | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const activeUserId = user?.userId;
    if (!activeUserId) {
      setLoading(false);
      return;
    }

    let active = true;

    async function load(): Promise<void> {
      try {
        const [profileResponse, trustResponse, achievementsResponse] = await Promise.all([
          getJson<{ profile: PlayerProfile }>(`/api/profiles/${activeUserId}`),
          getJson<{ trust: TrustSnapshot }>(`/api/trust/${activeUserId}`),
          getJson<{ achievements: Achievement[] }>(`/api/profiles/${activeUserId}/achievements`),
        ]);

        if (!active) return;
        setProfile(profileResponse.profile);
        setTrust(trustResponse.trust);
        setAchievements(achievementsResponse.achievements);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load profile.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [user?.userId]);

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading player profile...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Sign in to load your player profile.</Text>
      </View>
    );
  }

  if (error || !profile || !trust) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Profile unavailable.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>PLAYER PROFILE</Text>
      <Text style={styles.title}>{profile.username}</Text>

      <View style={styles.trustCard}>
        <Text style={styles.cardTitle}>Verified Human Poker</Text>
        <Text style={styles.trustRow}>Badge: {trust.verifiedHuman ? 'Verified Human' : 'Unverified'}</Text>
        <Text style={styles.trustRow}>Trust score: {trust.trustScore}/99</Text>
        <Text style={styles.trustRow}>Account age: {Math.max(1, trust.accountAgeDays)} days</Text>
        <Text style={styles.trustRow}>Security: {trust.securityVerificationStatus}</Text>
        <Text style={styles.trustNote}>No bots. No house players. Real opponents only.</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>Lv {profile.level}</Text>
          <Text style={styles.statLabel}>Player level</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.handsPlayed}</Text>
          <Text style={styles.statLabel}>Hands tracked</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.winStreak}</Text>
          <Text style={styles.statLabel}>Win streak</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Badges</Text>
        <View style={styles.tagRow}>
          {profile.badges.map((badge) => (
            <Text key={badge} style={styles.tag}>
              {badge}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Favorite Games</Text>
        {profile.favoriteGames.map((game) => (
          <Text key={game} style={styles.rowText}>
            • {game}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Achievements</Text>
        {achievements.map((item) => (
          <Text key={item.id} style={styles.rowText}>
            • {item.title}
          </Text>
        ))}
        {achievements.length === 0 ? <Text style={styles.rowText}>• Play tracked sessions to unlock achievements.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Tournament History</Text>
        {profile.tournamentHistory.map((entry) => (
          <Text key={`${entry.tournamentId}-${entry.placement}`} style={styles.rowText}>
            • {entry.tournamentId}: {entry.placement}th place (${entry.prize})
          </Text>
        ))}
        {profile.tournamentHistory.length === 0 ? <Text style={styles.rowText}>• No tournament results yet.</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#050A16', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#C7D8FA', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#050A16' },
  content: { padding: 20, paddingTop: 50, gap: 12 },
  eyebrow: { color: '#7ED3FF', letterSpacing: 1.8, fontSize: 11, fontWeight: '700' },
  title: { color: '#F6F9FF', fontSize: 30, fontWeight: '800' },
  trustCard: {
    backgroundColor: '#10213F',
    borderColor: '#305A95',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  card: {
    backgroundColor: '#0E1730',
    borderColor: '#223963',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  cardTitle: { color: '#F6F9FF', fontSize: 16, fontWeight: '700' },
  trustRow: { color: '#DDE9FF', fontSize: 13 },
  trustNote: { color: '#A8BDE5', fontSize: 12, lineHeight: 18, marginTop: 4 },
  grid: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: '#0F1A33',
    borderColor: '#213C67',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  statValue: { color: '#F2F8FF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#95ADD8', fontSize: 12 },
  rowText: { color: '#D5E2FF', fontSize: 13, lineHeight: 19 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    color: '#E8F2FF',
    backgroundColor: '#1C3259',
    borderWidth: 1,
    borderColor: '#426EA9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '700',
  },
});
