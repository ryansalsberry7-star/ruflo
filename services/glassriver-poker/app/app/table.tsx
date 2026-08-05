import { StyleSheet, Text, View } from 'react-native';

export default function TableScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.eyebrow}>SERVER-AUTHORITATIVE</Text>
        <Text style={styles.title}>Aurora • $0.05 / $0.10</Text>
      </View>

      <View style={styles.tableSurface}>
        <Text style={styles.centerText}>Board: 7♣ 9♦ K♠</Text>
        <Text style={styles.centerText}>Pot: $24.00 • No rake</Text>
      </View>

      <View style={styles.actionsRow}>
        <View style={styles.actionChip}><Text style={styles.actionText}>Fold</Text></View>
        <View style={styles.actionChip}><Text style={styles.actionText}>Check</Text></View>
        <View style={styles.actionChip}><Text style={styles.actionText}>Bet</Text></View>
        <View style={styles.actionChip}><Text style={styles.actionText}>Call</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816', padding: 24, justifyContent: 'space-between' },
  topBar: { gap: 6, marginTop: 18 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 24, fontWeight: '800' },
  tableSurface: {
    backgroundColor: '#0F1830',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#20314D',
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  centerText: { color: '#F8F7FF', fontSize: 16, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  actionChip: {
    flex: 1,
    backgroundColor: '#12172D',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#23304E',
  },
  actionText: { color: '#F8F7FF', fontWeight: '700' },
});
