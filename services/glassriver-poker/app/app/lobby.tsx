import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const tables = [
  { name: 'Aurora', stakes: '$0.05 / $0.10', speed: 'Fast', players: '24 online' },
  { name: 'Harbor', stakes: '$1 / $2', speed: 'Standard', players: '88 online' },
  { name: 'Summit', stakes: '$5 / $10', speed: 'Premium', players: '43 online' },
];

export default function LobbyScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>POKER LOBBY</Text>
        <Text style={styles.title}>Find your table</Text>
      </View>

      {tables.map((table) => (
        <Link key={table.name} href="/table" asChild>
          <Pressable style={styles.tableCard}>
            <View style={styles.left}>
              <Text style={styles.tableName}>{table.name}</Text>
              <Text style={styles.detail}>{table.stakes}</Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.badge}>{table.speed}</Text>
              <Text style={styles.detail}>{table.players}</Text>
            </View>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816', padding: 24, gap: 14 },
  header: { gap: 8, marginTop: 24 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 28, fontWeight: '800' },
  tableCard: {
    backgroundColor: '#12172D',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#23304E',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  left: { gap: 4 },
  right: { alignItems: 'flex-end', gap: 4 },
  tableName: { color: '#F8F7FF', fontSize: 18, fontWeight: '700' },
  detail: { color: '#A7B0CF', fontSize: 13 },
  badge: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
});
