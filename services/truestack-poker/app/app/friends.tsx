import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { getJson } from '../lib/api';

interface PlayerProfile {
  userId: string;
  username: string;
  follows: string[];
  online: boolean;
}

interface PokerClub {
  id: string;
  name: string;
  members: string[];
  weeklyTournamentName: string;
}

export default function FriendsScreen() {
  const { user, loading: authLoading } = useAuth();
  const [follows, setFollows] = useState<PlayerProfile[]>([]);
  const [clubs, setClubs] = useState<PokerClub[]>([]);
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
        const [myProfileResponse, clubsResponse] = await Promise.all([
          getJson<{ profile: PlayerProfile }>(`/api/profiles/${activeUserId}`),
          getJson<{ clubs: PokerClub[] }>('/api/social/clubs'),
        ]);

        const followIds = myProfileResponse.profile.follows;
        const followedProfiles = await Promise.all(
          followIds.map(async (followId) => {
            const profileResponse = await getJson<{ profile: PlayerProfile }>(`/api/profiles/${followId}`);
            return profileResponse.profile;
          })
        );

        if (!active) return;
        setFollows(followedProfiles);
        setClubs(clubsResponse.clubs);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load social data.');
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
        <Text style={styles.loadingText}>Loading friends and clubs...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Sign in to load your social graph.</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>POKER SOCIAL</Text>
      <Text style={styles.title}>Friends and Clubs</Text>
      <Text style={styles.subtitle}>Follow players, host private games, and build your own poker communities.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Online Friends</Text>
        {follows.map((friend) => (
          <Text key={friend.userId} style={styles.row}>
            • {friend.username} - {friend.online ? 'Online now' : 'Offline'}
          </Text>
        ))}
        {follows.length === 0 ? <Text style={styles.row}>• Follow players to see their status here.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Poker Clubs</Text>
        {clubs.map((club) => (
          <View key={club.id} style={styles.clubRow}>
            <Text style={styles.clubName}>{club.name}</Text>
            <Text style={styles.clubMeta}>{club.members.length} members</Text>
            <Text style={styles.clubMeta}>{club.weeklyTournamentName}</Text>
          </View>
        ))}
        {clubs.length === 0 ? <Text style={styles.row}>• No clubs yet. Create one from social tools.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Private Game Tools</Text>
        <Text style={styles.row}>• Invite-only home game tables</Text>
        <Text style={styles.row}>• Club leaderboards and weekly ladders</Text>
        <Text style={styles.row}>• Shared hand review inside friend circles</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#060816', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#C7D8FA', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 20, paddingTop: 50, gap: 12 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.8 },
  title: { color: '#F5F8FF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A8B8DA', lineHeight: 20 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#253D66',
    backgroundColor: '#101A32',
    padding: 13,
    gap: 6,
  },
  cardTitle: { color: '#ECF3FF', fontSize: 16, fontWeight: '700' },
  row: { color: '#C5D9FA', lineHeight: 19 },
  clubRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4C79',
    backgroundColor: '#122142',
    padding: 10,
    gap: 2,
  },
  clubName: { color: '#F3F8FF', fontWeight: '700' },
  clubMeta: { color: '#ABC4EB', fontSize: 12 },
});
