import { StyleSheet, Text, View } from 'react-native';

export default function WalletScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>WALLET</Text>
        <Text style={styles.title}>Virtual credits</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.balance}>$1,000.00</Text>
        <Text style={styles.subtext}>Available chips • Tournament tickets • Bonuses</Text>
      </View>

      <View style={styles.transactionList}>
        <Text style={styles.row}>• Deposit: $150.00</Text>
        <Text style={styles.row}>• Buy-in: $100.00</Text>
        <Text style={styles.row}>• Win: $240.00</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816', padding: 24, gap: 18 },
  header: { gap: 8, marginTop: 24 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 28, fontWeight: '800' },
  card: { backgroundColor: '#12172D', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#23304E' },
  balance: { color: '#F8F7FF', fontSize: 32, fontWeight: '800' },
  subtext: { color: '#A7B0CF', marginTop: 8 },
  transactionList: { gap: 8 },
  row: { color: '#BFC7E2', fontSize: 14 },
});
