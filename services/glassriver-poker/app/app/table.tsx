import { Link } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

type DealerTheme = 'Classic Vegas' | 'Luxury Tournament' | 'Modern Digital' | 'Futuristic';

interface SeatView {
  id: string;
  username: string;
  stack: number;
  currentBet: number;
  status: 'waiting' | 'thinking' | 'betting' | 'calling' | 'raising' | 'folded' | 'all-in' | 'disconnected' | 'sitting-out';
  timeBankSeconds: number;
  isDealer: boolean;
}

const seats: SeatView[] = [
  {
    id: 'p1',
    username: 'Ada',
    stack: 1280,
    currentBet: 20,
    status: 'thinking',
    timeBankSeconds: 18,
    isDealer: true,
  },
  {
    id: 'p2',
    username: 'Linus',
    stack: 940,
    currentBet: 20,
    status: 'calling',
    timeBankSeconds: 24,
    isDealer: false,
  },
  {
    id: 'p3',
    username: 'Grace',
    stack: 1560,
    currentBet: 0,
    status: 'waiting',
    timeBankSeconds: 30,
    isDealer: false,
  },
];

const dealerThemes: DealerTheme[] = ['Classic Vegas', 'Luxury Tournament', 'Modern Digital', 'Futuristic'];

export default function TableScreen() {
  const [betValue, setBetValue] = useState(80);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [countdown, setCountdown] = useState(15);
  const [selectedTheme, setSelectedTheme] = useState<DealerTheme>('Luxury Tournament');

  const dealAnim = useRef(new Animated.Value(0)).current;
  const potPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 0 ? 15 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dealAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(dealAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(potPulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(potPulse, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [dealAnim, potPulse]);

  const timerColor = countdown <= 5 ? '#FF6C6C' : '#7ED3FF';
  const chipScale = potPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const dealTranslate = dealAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 32] });

  const quickBets = useMemo(
    () => [
      { label: 'Min', value: 20 },
      { label: '1/2 Pot', value: 70 },
      { label: 'Pot', value: 140 },
      { label: 'Max', value: 320 },
    ],
    []
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>NO RAKE • VERIFIED FAIR PLAY</Text>
        <Text style={styles.title}>Aurora Table • $0.05/$0.10</Text>
      </View>

      <View style={styles.dealerPodium}>
        <View style={styles.dealerAvatar}>
          <Text style={styles.dealerAvatarText}>D</Text>
        </View>
        <View style={styles.dealerMeta}>
          <Text style={styles.dealerLabel}>Digital Dealer</Text>
          <Text style={styles.dealerTheme}>{selectedTheme}</Text>
          <Text style={styles.dealerNeutral}>Server controls cards, shuffle, outcomes</Text>
        </View>
      </View>

      <View style={styles.themeRow}>
        {dealerThemes.map((theme) => (
          <Pressable key={theme} style={[styles.themeChip, selectedTheme === theme && styles.themeChipActive]} onPress={() => setSelectedTheme(theme)}>
            <Text style={[styles.themeChipText, selectedTheme === theme && styles.themeChipTextActive]}>{theme}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.tableSurface}>
        <View style={styles.tableGlow} />
        <View style={styles.centerCluster}>
          <Animated.View style={[styles.potBadge, { transform: [{ scale: chipScale }] }]}>
            <Text style={styles.potValue}>Pot $142.00</Text>
            <Text style={styles.potMeta}>Last bet $20 • No rake</Text>
          </Animated.View>

          <View style={styles.communityRow}>
            {['7♣', '9♦', 'K♠', '2♥', ''].map((card, idx) => (
              <Animated.View key={`${card}-${idx}`} style={[styles.cardSlot, idx === 4 && styles.cardPending, { transform: [{ translateY: dealTranslate }] }]}>
                <Text style={styles.cardText}>{card || '•'}</Text>
              </Animated.View>
            ))}
          </View>

          <Text style={[styles.timerText, { color: timerColor }]}>Action timer: {countdown}s</Text>
        </View>

        <View style={styles.seatRing}>
          {seats.map((seat) => (
            <View key={seat.id} style={styles.seatCard}>
              <View style={styles.seatTop}>
                <Text style={styles.seatName}>{seat.username}</Text>
                {seat.isDealer && <Text style={styles.dealerButton}>D</Text>}
              </View>
              <Text style={styles.seatStack}>${seat.stack.toFixed(2)}</Text>
              <Text style={styles.seatBet}>Bet ${seat.currentBet.toFixed(2)}</Text>
              <Text style={styles.seatStatus}>{seat.status.toUpperCase()}</Text>
              <Text style={styles.timeBank}>Time bank {seat.timeBankSeconds}s</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.audioPanel}>
        <View style={styles.audioRow}>
          <Text style={styles.audioLabel}>Dealer & table sounds</Text>
          <Switch value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{ false: '#32415F', true: '#3E8FFF' }} />
        </View>
        <View style={styles.audioRow}>
          <Text style={styles.audioLabel}>Haptic feedback</Text>
          <Switch value={hapticsEnabled} onValueChange={setHapticsEnabled} trackColor={{ false: '#32415F', true: '#3E8FFF' }} />
        </View>
      </View>

      <View style={styles.controlsPanel}>
        <Text style={styles.raiseLabel}>Raise ${betValue.toFixed(2)}</Text>
        <View style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: `${Math.min(100, (betValue / 320) * 100)}%` }]} />
        </View>
        <View style={styles.quickRow}>
          {quickBets.map((quick) => (
            <Pressable key={quick.label} style={styles.quickButton} onPress={() => setBetValue(quick.value)}>
              <Text style={styles.quickText}>{quick.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.actionsGrid}>
          {['Fold', 'Check', 'Call', 'Raise', 'All-in'].map((label) => (
            <Pressable key={label} style={[styles.actionButton, label === 'Fold' && styles.foldButton, label === 'Raise' && styles.raiseButton]}>
              <Text style={styles.actionButtonText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.footerLinks}>
        <Link href="/hand-verification" asChild>
          <Pressable style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Hand Verification</Text>
          </Pressable>
        </Link>
        <Link href="/hand-history" asChild>
          <Pressable style={styles.linkButton}>
            <Text style={styles.linkButtonText}>Replay Center</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050813' },
  content: { paddingHorizontal: 16, paddingTop: 44, paddingBottom: 28, gap: 14 },
  headerRow: { gap: 4 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: '#F5F8FF', fontSize: 24, fontWeight: '800' },

  dealerPodium: {
    backgroundColor: '#0F1730',
    borderColor: '#253454',
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  dealerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1D2B47',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#3A4F79',
    borderWidth: 1,
  },
  dealerAvatarText: { color: '#DDE9FF', fontWeight: '800', fontSize: 20 },
  dealerMeta: { flex: 1, gap: 2 },
  dealerLabel: { color: '#F5F8FF', fontSize: 16, fontWeight: '700' },
  dealerTheme: { color: '#9FB6E6', fontSize: 13, fontWeight: '600' },
  dealerNeutral: { color: '#8C9BC1', fontSize: 12 },

  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeChip: {
    borderWidth: 1,
    borderColor: '#2E3F61',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#0C1328',
  },
  themeChipActive: { borderColor: '#5AA5FF', backgroundColor: '#132341' },
  themeChipText: { color: '#AAB8DC', fontSize: 12, fontWeight: '600' },
  themeChipTextActive: { color: '#E8F2FF' },

  tableSurface: {
    backgroundColor: '#0A1226',
    borderRadius: 24,
    borderColor: '#21304E',
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: 18,
    paddingHorizontal: 12,
    gap: 14,
  },
  tableGlow: {
    position: 'absolute',
    top: -120,
    alignSelf: 'center',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#17345C',
    opacity: 0.22,
  },
  centerCluster: { alignItems: 'center', gap: 10 },
  potBadge: {
    backgroundColor: '#101B35',
    borderColor: '#2C4571',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  potValue: { color: '#F5F8FF', fontWeight: '800', fontSize: 18 },
  potMeta: { color: '#8DA5D6', fontSize: 12 },
  communityRow: { flexDirection: 'row', gap: 8 },
  cardSlot: {
    width: 44,
    height: 62,
    borderRadius: 8,
    backgroundColor: '#F4F7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardPending: { backgroundColor: '#1A2A47' },
  cardText: { color: '#16233F', fontWeight: '700', fontSize: 17 },
  timerText: { fontSize: 14, fontWeight: '700' },

  seatRing: { gap: 8 },
  seatCard: {
    borderWidth: 1,
    borderColor: '#243454',
    backgroundColor: '#0E1730',
    borderRadius: 14,
    padding: 10,
  },
  seatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seatName: { color: '#E7EEFF', fontSize: 14, fontWeight: '700' },
  dealerButton: {
    color: '#0B1730',
    backgroundColor: '#FFD363',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    fontWeight: '800',
    fontSize: 12,
  },
  seatStack: { color: '#96B2E2', marginTop: 2 },
  seatBet: { color: '#C6D5F5', marginTop: 2 },
  seatStatus: { color: '#7ED3FF', marginTop: 4, fontSize: 11, fontWeight: '700' },
  timeBank: { color: '#7C8FB9', marginTop: 2, fontSize: 12 },

  audioPanel: {
    borderWidth: 1,
    borderColor: '#243454',
    backgroundColor: '#0D1530',
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  audioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  audioLabel: { color: '#D9E5FF', fontSize: 14, fontWeight: '600' },

  controlsPanel: {
    borderWidth: 1,
    borderColor: '#243454',
    backgroundColor: '#0E1731',
    borderRadius: 18,
    padding: 12,
    gap: 10,
  },
  raiseLabel: { color: '#F4F8FF', fontSize: 16, fontWeight: '700' },
  sliderTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#22375F',
    overflow: 'hidden',
  },
  sliderFill: { height: '100%', backgroundColor: '#5AA5FF' },
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quickButton: {
    borderColor: '#334D7B',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#13213E',
  },
  quickText: { color: '#DFEBFF', fontSize: 12, fontWeight: '700' },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: {
    flexBasis: '31%',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#1E2F50',
    borderWidth: 1,
    borderColor: '#355384',
  },
  foldButton: { backgroundColor: '#3F2028', borderColor: '#8D3F56' },
  raiseButton: { backgroundColor: '#163850', borderColor: '#2B7CB0' },
  actionButtonText: { color: '#F3F8FF', fontWeight: '800' },

  footerLinks: { flexDirection: 'row', gap: 10 },
  linkButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    backgroundColor: '#1B2A48',
    borderWidth: 1,
    borderColor: '#2D4672',
    alignItems: 'center',
  },
  linkButtonText: { color: '#DDE9FF', fontWeight: '700' },
});
