import { ScrollView, StyleSheet, Text, View } from 'react-native';

const onlineFriends = [
  { name: 'LinusRiver', status: 'Online at Aurora $0.05/$0.10' },
  { name: 'GraceRiver', status: 'Playing tournament: Daily Royal Sprint' },
  { name: 'NinaRiver', status: 'Open for private game invite' },
];

const clubs = [
  { name: 'GlassRiver Founders Club', members: 84, event: 'Weekly Championship - Friday 8PM' },
  { name: 'No-Rake Home Game', members: 26, event: 'Cash League - Wednesday 9PM' },
];

export default function FriendsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>POKER SOCIAL</Text>
      <Text style={styles.title}>Friends and Clubs</Text>
      <Text style={styles.subtitle}>Follow players, host private games, and build your own poker communities.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Online Friends</Text>
        {onlineFriends.map((friend) => (
          <Text key={friend.name} style={styles.row}>
            • {friend.name} - {friend.status}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Poker Clubs</Text>
        {clubs.map((club) => (
          <View key={club.name} style={styles.clubRow}>
            <Text style={styles.clubName}>{club.name}</Text>
            <Text style={styles.clubMeta}>{club.members} members</Text>
            <Text style={styles.clubMeta}>{club.event}</Text>
          </View>
        ))}
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
