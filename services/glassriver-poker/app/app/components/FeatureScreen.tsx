import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface FeatureScreenProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function FeatureScreen({ eyebrow, title, description }: FeatureScreenProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <View style={styles.policyCard}>
        <Text style={styles.policyTitle}>Zero-rake policy</Text>
        <Text style={styles.policyText}>All poker pots are distributed player-to-player. Platform fees are shown separately before payment confirmation.</Text>
      </View>

      <Link href="/" asChild>
        <Pressable style={styles.backButton}>
          <Text style={styles.backText}>Back to dashboard</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#060816', padding: 24, justifyContent: 'space-between' },
  header: { gap: 10, marginTop: 40 },
  eyebrow: { color: '#7ED3FF', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#F8F7FF', fontSize: 30, fontWeight: '800' },
  description: { color: '#A7B0CF', fontSize: 15, lineHeight: 22 },
  policyCard: {
    backgroundColor: '#12172D',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#23304E',
    padding: 16,
    gap: 8,
  },
  policyTitle: { color: '#F8F7FF', fontSize: 16, fontWeight: '700' },
  policyText: { color: '#BFC7E2', fontSize: 14, lineHeight: 20 },
  backButton: {
    backgroundColor: '#3E8FFF',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  backText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
