import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getJson } from './lib/api';

interface TrustCenterResponse {
  trustCenter: {
    promise: string;
    antiCheatArchitecture: string[];
    protections: string[];
  };
  fairPlay: {
    antiCheat: string[];
  };
}

interface FairPlayResponse {
  dealerControl: {
    cardGeneration: string;
    shuffling: string;
    outcomes: string;
  };
}

export default function FairPlayScreen() {
  const [trustCenter, setTrustCenter] = useState<TrustCenterResponse['trustCenter'] | null>(null);
  const [antiCheatTags, setAntiCheatTags] = useState<string[]>([]);
  const [dealerControl, setDealerControl] = useState<FairPlayResponse['dealerControl'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const [center, fairPlay] = await Promise.all([
          getJson<TrustCenterResponse>('/api/transparency/trust-center'),
          getJson<FairPlayResponse>('/api/fair-play'),
        ]);

        if (!active) return;
        setTrustCenter(center.trustCenter);
        setAntiCheatTags(center.fairPlay.antiCheat);
        setDealerControl(fairPlay.dealerControl);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load trust center.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading trust center...</Text>
      </View>
    );
  }

  if (error || !trustCenter || !dealerControl) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Trust center unavailable.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>TRUST CENTER</Text>
      <Text style={styles.title}>Fair Play Transparency</Text>
      <Text style={styles.subtitle}>Built to make players trust the game, not just the marketing. This App Store build is play-money only.</Text>

      <View style={styles.promiseCard}>
        <Text style={styles.promiseTitle}>{trustCenter.promise}</Text>
        <Text style={styles.promiseBody}>
          Every hand is dealt by the server-side digital dealer. Outcomes are never controlled by clients or hidden actors.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Verified Human Poker System</Text>
        <Text style={styles.row}>• Verified Human badge</Text>
        <Text style={styles.row}>• Trust score and account age indicator</Text>
        <Text style={styles.row}>• Security verification status (email, ID, enhanced)</Text>
        <Text style={styles.row}>• Fair-play reputation based on behavior, not winnings</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Anti-Cheat Architecture</Text>
        {trustCenter.antiCheatArchitecture.map((item) => (
          <Text key={item} style={styles.row}>
            • {item}
          </Text>
        ))}
        {antiCheatTags.map((item) => (
          <Text key={item} style={styles.row}>
            • Detection pipeline: {item}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How Hand Verification Works</Text>
        <Text style={styles.row}>• Dealer control: card generation is {dealerControl.cardGeneration}.</Text>
        <Text style={styles.row}>• Shuffle authority: {dealerControl.shuffling}.</Text>
        <Text style={styles.row}>• Outcome authority: {dealerControl.outcomes}.</Text>
        {trustCenter.protections.map((item) => (
          <Text key={item} style={styles.row}>• {item}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: '#060816', justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { color: '#C7D8FA', fontSize: 14 },
  errorText: { color: '#FFB4B4', fontSize: 13, textAlign: 'center' },
  screen: { flex: 1, backgroundColor: '#060816' },
  content: { padding: 20, paddingTop: 50, gap: 12 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.8 },
  title: { color: '#F5F8FF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#A6B7D9', lineHeight: 20 },
  promiseCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3979C4',
    backgroundColor: '#13284A',
    padding: 14,
    gap: 6,
  },
  promiseTitle: { color: '#F8FBFF', fontWeight: '800', fontSize: 17 },
  promiseBody: { color: '#D2E3FF', lineHeight: 19 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#263E65',
    backgroundColor: '#101A32',
    padding: 13,
    gap: 5,
  },
  cardTitle: { color: '#E9F1FF', fontSize: 15, fontWeight: '700' },
  row: { color: '#C6D8FA', lineHeight: 19 },
});
