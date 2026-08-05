import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

export default function SettingsScreen() {
  const [sound, setSound] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [notifications, setNotifications] = useState(true);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>ACCOUNT</Text>
      <Text style={styles.title}>App settings</Text>
      <Text style={styles.subtitle}>Mobile-first controls and iOS release readiness for App Store distribution.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Table experience</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Sound effects</Text>
          <Switch value={sound} onValueChange={setSound} trackColor={{ false: '#35435F', true: '#3E8FFF' }} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Haptic feedback</Text>
          <Switch value={haptics} onValueChange={setHaptics} trackColor={{ false: '#35435F', true: '#3E8FFF' }} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Action alerts</Text>
          <Switch value={notifications} onValueChange={setNotifications} trackColor={{ false: '#35435F', true: '#3E8FFF' }} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>iOS release readiness</Text>
        <Text style={styles.line}>• Safe-area aware layouts enabled</Text>
        <Text style={styles.line}>• Portrait orientation locked for one-handed play</Text>
        <Text style={styles.line}>• App Store bundle identifier configured</Text>
        <Text style={styles.line}>• Encryption declaration set for submission metadata</Text>
        <Text style={styles.line}>• EAS production profile prepared</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 24, paddingTop: 56, gap: 14 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#F7FAFF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A7B5D8', lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: '#2D456E',
    borderRadius: 16,
    backgroundColor: '#101A33',
    padding: 14,
    gap: 9,
  },
  cardTitle: { color: '#EFF5FF', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: '#D4E2FF', fontSize: 14, fontWeight: '600' },
  line: { color: '#BACCEE', lineHeight: 20 },
});
