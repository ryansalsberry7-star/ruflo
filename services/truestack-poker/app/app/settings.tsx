import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTablePreferences, type LiveDealerQuality } from './lib/tablePreferences';

export default function SettingsScreen() {
  const { preferences, setPreferences } = useTablePreferences();
  const qualityOptions: LiveDealerQuality[] = ['auto', 'high', 'balanced', 'lite'];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>TABLE EXPERIENCE</Text>
      <Text style={styles.title}>App settings</Text>
      <Text style={styles.subtitle}>Tune the premium table presentation, live dealer realism, and fallback behavior for performance and comfort.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Table experience</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Sound effects</Text>
          <Switch value={preferences.soundEffectsEnabled} onValueChange={(value) => setPreferences({ soundEffectsEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Haptic feedback</Text>
          <Switch value={preferences.hapticFeedbackEnabled} onValueChange={(value) => setPreferences({ hapticFeedbackEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Action alerts</Text>
          <Switch value={preferences.actionAlertsEnabled} onValueChange={(value) => setPreferences({ actionAlertsEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Premium live dealer</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>3D dealer</Text>
          <Switch value={preferences.liveDealerEnabled} onValueChange={(value) => setPreferences({ liveDealerEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Dealer voice</Text>
          <Switch value={preferences.dealerVoiceEnabled} onValueChange={(value) => setPreferences({ dealerVoiceEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Ambient table effects</Text>
          <Switch value={preferences.ambientEffectsEnabled} onValueChange={(value) => setPreferences({ ambientEffectsEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
        <Text style={styles.subLabel}>Animation quality</Text>
        <View style={styles.qualityRow}>
          {qualityOptions.map((quality) => {
            const selected = preferences.liveDealerQuality === quality;
            return (
              <Pressable
                key={quality}
                onPress={() => setPreferences({ liveDealerQuality: quality })}
                style={[styles.qualityChip, selected && styles.qualityChipActive]}
              >
                <Text style={[styles.qualityText, selected && styles.qualityTextActive]}>{quality}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.line}>• `auto` keeps the 3D dealer on when the device can comfortably sustain smooth motion.</Text>
        <Text style={styles.line}>• `lite` falls back to simpler animation density and fewer overlay effects.</Text>
        <Text style={styles.line}>• Disabling the dealer swaps in a clean virtual dealer plaque and preserves all gameplay logic.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Release posture</Text>
        <Text style={styles.line}>• The dealer reacts to server-authoritative game events only.</Text>
        <Text style={styles.line}>• Camera motion stays subtle so cards, pot, and controls never lose visibility.</Text>
        <Text style={styles.line}>• Dealer skins remain cosmetic only and can be expanded without affecting rules.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#17090D' },
  content: { padding: 24, paddingTop: 44, paddingBottom: 28, gap: 16 },
  eyebrow: { color: '#F1C46E', fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  title: { color: '#FFF4E7', fontSize: 32, fontWeight: '900' },
  subtitle: { color: '#D8C4BA', lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderColor: '#4B2630',
    borderRadius: 22,
    backgroundColor: '#221017',
    padding: 16,
    gap: 10,
  },
  cardTitle: { color: '#FFF4E7', fontSize: 17, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: '#F0DED0', fontSize: 14, fontWeight: '700' },
  subLabel: { color: '#F7D9A2', fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  qualityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qualityChip: {
    borderWidth: 1,
    borderColor: '#7A4A53',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#311720',
  },
  qualityChipActive: {
    backgroundColor: '#F1C46E',
    borderColor: '#F6D998',
  },
  qualityText: { color: '#FFF4E7', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  qualityTextActive: { color: '#2A1118' },
  line: { color: '#CDB4AA', lineHeight: 20 },
});
