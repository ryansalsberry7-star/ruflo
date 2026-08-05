import { ScrollView, StyleSheet, Text, View } from 'react-native';

const profile = {
  username: 'AdaRiver',
  verifiedHuman: true,
  trustScore: 94,
  accountAge: '14 months',
  security: 'ID + device verified',
  level: 8,
  badges: ['Trusted Player', 'Table Veteran', 'Sportsmanship+'],
  favoriteGames: ['No-Limit Holdem', 'Heads-Up Sit & Go'],
  winStreak: 5,
  totalHands: 1428,
  tournamentHistory: [
    { name: 'Weekend GlassRiver Major', placement: 9, prize: '$1,800' },
    { name: 'Daily Royal Sprint', placement: 2, prize: '$420' },
  ],
  achievements: [
    'First Royal Flush',
    '1,000 Hands Played',
    'Comeback King',
    'Bluff Master',
  ],
};

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>PLAYER PROFILE</Text>
      <Text style={styles.title}>{profile.username}</Text>

      <View style={styles.trustCard}>
        <Text style={styles.cardTitle}>Verified Human Poker</Text>
        <Text style={styles.trustRow}>Badge: {profile.verifiedHuman ? 'Verified Human' : 'Unverified'}</Text>
        <Text style={styles.trustRow}>Trust score: {profile.trustScore}/99</Text>
        <Text style={styles.trustRow}>Account age: {profile.accountAge}</Text>
        <Text style={styles.trustRow}>Security: {profile.security}</Text>
        <Text style={styles.trustNote}>No bots. No house players. Real opponents only.</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>Lv {profile.level}</Text>
          <Text style={styles.statLabel}>Player level</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile.totalHands}</Text>
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
        {profile.achievements.map((item) => (
          <Text key={item} style={styles.rowText}>
            • {item}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Tournament History</Text>
        {profile.tournamentHistory.map((entry) => (
          <Text key={entry.name} style={styles.rowText}>
            • {entry.name}: {entry.placement}th place ({entry.prize})
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
