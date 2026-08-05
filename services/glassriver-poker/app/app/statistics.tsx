import { ScrollView, StyleSheet, Text, View } from 'react-native';

const coachSnapshot = {
  sessionLength: '1h 48m',
  handsPlayed: 126,
  netResult: '+$184',
  biggestPot: '$312',
  bestDecision: 'Turn check-raise on draw-heavy board for max fold equity.',
  biggestMistake: 'Calling too often on river against polar sizing.',
  missedOpportunity: 'Under-defending the big blind versus small opens.',
  style: 'Disciplined TAG with low blind defense frequency.',
};

export default function StatisticsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>AI COACH</Text>
      <Text style={styles.title}>Session Review</Text>
      <Text style={styles.subtitle}>Improve faster with post-session analysis built into every game.</Text>

      <View style={styles.row}>
        <StatCard label="Session" value={coachSnapshot.sessionLength} />
        <StatCard label="Hands" value={String(coachSnapshot.handsPlayed)} />
      </View>
      <View style={styles.row}>
        <StatCard label="Net" value={coachSnapshot.netResult} />
        <StatCard label="Biggest Pot" value={coachSnapshot.biggestPot} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Biggest Mistake</Text>
        <Text style={styles.panelBody}>{coachSnapshot.biggestMistake}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Best Decision</Text>
        <Text style={styles.panelBody}>{coachSnapshot.bestDecision}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Missed Opportunity</Text>
        <Text style={styles.panelBody}>{coachSnapshot.missedOpportunity}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Playing Style Analysis</Text>
        <Text style={styles.panelBody}>{coachSnapshot.style}</Text>
      </View>

      <View style={styles.tierPanel}>
        <Text style={styles.tierTitle}>Free</Text>
        <Text style={styles.tierText}>Basic session stats and top 1 leak.</Text>
        <Text style={styles.tierTitle}>Premium</Text>
        <Text style={styles.tierText}>Hand-by-hand analysis, position leaks, and personalized weekly plan.</Text>
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 20, paddingTop: 50, gap: 12 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.8 },
  title: { color: '#F5F8FF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A9B9DA', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#214171',
    backgroundColor: '#0E1A34',
    padding: 12,
  },
  statValue: { color: '#F8FAFF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: '#9EB6E0', fontSize: 12 },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#243D66',
    backgroundColor: '#111B35',
    padding: 13,
    gap: 5,
  },
  panelTitle: { color: '#EAF2FF', fontWeight: '700' },
  panelBody: { color: '#C8D9F9', lineHeight: 19 },
  tierPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3D659A',
    backgroundColor: '#16284A',
    padding: 13,
    gap: 5,
    marginBottom: 20,
  },
  tierTitle: { color: '#F8FBFF', fontWeight: '800' },
  tierText: { color: '#D0E1FF', lineHeight: 19 },
});
