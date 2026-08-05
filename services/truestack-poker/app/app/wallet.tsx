import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function WalletScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>WALLET</Text>
        <Text style={styles.title}>Virtual credits</Text>
        <Text style={styles.subtitle}>Play-money wallet preview. Transparent fees outside poker pots. Zero rake always.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.balance}>$1,000.00</Text>
        <Text style={styles.subtext}>Available demo chips • Tournament tickets • Bonuses</Text>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>Preview fee model only</Text>
          <Text style={styles.tag}>No real-money processing in this build</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionText}>Add demo chips</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionText}>Reward tickets</Text>
        </Pressable>
      </View>

      <View style={styles.transactionList}>
        <Text style={styles.sectionTitle}>Recent ledger entries</Text>
        <Text style={styles.row}>• Demo chip grant: $150.00</Text>
        <Text style={styles.row}>• Buy-in: $100.00</Text>
        <Text style={styles.row}>• Win: $240.00</Text>
        <Text style={styles.row}>• No real-money deposits or withdrawals are available in this version.</Text>
      </View>

      <Link href="/transaction-history" asChild>
        <Pressable style={styles.historyButton}>
          <Text style={styles.historyButtonText}>Open full transaction history</Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 24, gap: 14 },
  header: { gap: 8, marginTop: 24 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#A5B4D5', lineHeight: 20 },
  card: { backgroundColor: '#12172D', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#23304E' },
  balance: { color: '#F8F7FF', fontSize: 32, fontWeight: '800' },
  subtext: { color: '#A7B0CF', marginTop: 8 },
  tagRow: { marginTop: 12, gap: 6 },
  tag: {
    alignSelf: 'flex-start',
    color: '#CBDBFB',
    fontSize: 12,
    backgroundColor: '#203358',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3D598D',
    borderRadius: 12,
    backgroundColor: '#152642',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actionText: { color: '#E8F1FF', fontWeight: '700' },
  transactionList: {
    gap: 8,
    borderWidth: 1,
    borderColor: '#2C4269',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#0F1A32',
  },
  sectionTitle: { color: '#E5EEFF', fontWeight: '700', marginBottom: 2 },
  row: { color: '#BFC7E2', fontSize: 14 },
  historyButton: {
    borderRadius: 12,
    backgroundColor: '#3E8FFF',
    alignItems: 'center',
    paddingVertical: 13,
  },
  historyButtonText: { color: '#FFF', fontWeight: '700' },
});
