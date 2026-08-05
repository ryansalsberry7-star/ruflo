import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { VerifiedHumanBadge } from './components/VerifiedHumanBadge';
import { useAuth } from './lib/auth';
import { getJson, postJson } from './lib/api';
import { PLAYER_CHARACTERS, getPlayerCharacter, type PlayerCharacterId } from './lib/playerIdentity';

interface PlayerProfile {
  userId: string;
  username: string;
  favoriteGames: string[];
  handsPlayed: number;
  winStreak: number;
  level: number;
  badges: string[];
  customization: {
    playerCharacter: string;
    tableTheme: string;
    chipDesign: string;
    profileFrame: string;
  };
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
  const { user, authToken, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [trust, setTrust] = useState<TrustSnapshot | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<string | null>(null);
  const [savingCharacter, setSavingCharacter] = useState(false);

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

  const activeCharacter = getPlayerCharacter(profile.customization.playerCharacter);

  async function handleCharacterSelect(characterId: PlayerCharacterId): Promise<void> {
    const currentProfile = profile;
    if (!user || !authToken || !currentProfile || currentProfile.customization.playerCharacter === characterId) return;
    setSavingCharacter(true);
    setSaveState(null);

    try {
      const response = await postJson<{ profile: PlayerProfile }>(
        `/api/profiles/${user.userId}/customization`,
        { playerCharacter: characterId },
        { headers: { authorization: `Bearer ${authToken}` } }
      );
      setProfile(response.profile);
      setSaveState('Character updated for lobby, profile, and table views.');
    } catch (saveError) {
      setSaveState(saveError instanceof Error ? saveError.message : 'Failed to update character.');
    } finally {
      setSavingCharacter(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.eyebrow}>PLAYER PROFILE</Text>
        <Text style={styles.title}>{profile.username}</Text>
        <Text style={styles.subtitle}>Your player card now carries a chosen character identity and trust status directly onto the table.</Text>
        <View style={styles.heroRow}>
          <View style={[styles.characterAvatar, { backgroundColor: activeCharacter.aura, borderColor: activeCharacter.accent }]}>
            <Text style={styles.characterEmoji}>{activeCharacter.emoji}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.characterName}>{activeCharacter.name}</Text>
            <Text style={styles.characterTitle}>{activeCharacter.title}</Text>
            <Text style={styles.characterDescription}>{activeCharacter.description}</Text>
            {trust.verifiedHuman ? <VerifiedHumanBadge /> : <Text style={styles.pendingBadge}>Shield unlocks after human verification.</Text>}
          </View>
        </View>
      </View>

      <View style={styles.trustCard}>
        <Text style={styles.cardTitle}>Trust center</Text>
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
        <Text style={styles.cardTitle}>Choose your character</Text>
        <View style={styles.characterGrid}>
          {PLAYER_CHARACTERS.map((character) => {
            const selected = character.id === profile.customization.playerCharacter;
            return (
              <Pressable
                key={character.id}
                disabled={savingCharacter}
                onPress={() => void handleCharacterSelect(character.id)}
                style={[
                  styles.characterOption,
                  { backgroundColor: character.aura },
                  selected && { borderColor: character.glow, shadowColor: character.accent, shadowOpacity: 0.45, shadowRadius: 14 },
                ]}
              >
                <View style={styles.characterOptionTop}>
                  <Text style={styles.optionEmoji}>{character.emoji}</Text>
                  {selected && trust.verifiedHuman ? <VerifiedHumanBadge compact /> : null}
                </View>
                <Text style={styles.optionName}>{character.name}</Text>
                <Text style={styles.optionTitle}>{character.title}</Text>
                <Text style={styles.optionDescription}>{character.description}</Text>
              </Pressable>
            );
          })}
        </View>
        {saveState ? <Text style={styles.saveState}>{saveState}</Text> : null}
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
  centered: { flex: 1, backgroundColor: '#17090D', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#E4D3C3', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#17090D' },
  content: { padding: 20, paddingTop: 40, paddingBottom: 28, gap: 14 },
  heroCard: {
    backgroundColor: '#2A1118',
    borderColor: '#5E3032',
    borderWidth: 1,
    borderRadius: 28,
    padding: 18,
    gap: 10,
  },
  eyebrow: { color: '#F1C46E', letterSpacing: 1.8, fontSize: 11, fontWeight: '800' },
  title: { color: '#FFF4E7', fontSize: 32, fontWeight: '900' },
  subtitle: { color: '#D6C0B7', lineHeight: 20 },
  heroRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  characterAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  characterEmoji: { fontSize: 40 },
  heroCopy: { flex: 1, gap: 2 },
  characterName: { color: '#FFF4E7', fontSize: 21, fontWeight: '900' },
  characterTitle: { color: '#F7D9A2', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  characterDescription: { color: '#D6C0B7', fontSize: 13, lineHeight: 19 },
  pendingBadge: { color: '#B99E8D', fontSize: 12, lineHeight: 18 },
  trustCard: {
    backgroundColor: '#241319',
    borderColor: '#6A4047',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 5,
  },
  card: {
    backgroundColor: '#221017',
    borderColor: '#4B2630',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  cardTitle: { color: '#FFF4E7', fontSize: 17, fontWeight: '800' },
  trustRow: { color: '#F0DED0', fontSize: 13 },
  trustNote: { color: '#C7ACA0', fontSize: 12, lineHeight: 18, marginTop: 4 },
  grid: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: '#2D151D',
    borderColor: '#6A4047',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  statValue: { color: '#FFF4E7', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#C7ACA0', fontSize: 12 },
  rowText: { color: '#F0DED0', fontSize: 13, lineHeight: 19 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  characterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  characterOption: {
    width: '47%',
    minHeight: 150,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,244,231,0.18)',
    padding: 12,
    gap: 6,
  },
  characterOptionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  optionEmoji: { fontSize: 28 },
  optionName: { color: '#FFF8EF', fontSize: 15, fontWeight: '800' },
  optionTitle: { color: '#F6E7C8', fontSize: 11, fontWeight: '800', lineHeight: 16 },
  optionDescription: { color: '#FFF1E2', fontSize: 11, lineHeight: 16 },
  saveState: { color: '#F1C46E', fontSize: 12, lineHeight: 18 },
  tag: {
    color: '#FFF4E7',
    backgroundColor: '#3C1D26',
    borderWidth: 1,
    borderColor: '#7A4A53',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    fontWeight: '700',
  },
});
