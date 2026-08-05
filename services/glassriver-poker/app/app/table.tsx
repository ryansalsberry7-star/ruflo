import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useAuth } from './lib/auth';
import { postJson, resolveWebSocketBaseUrl } from './lib/api';

interface TablePlayer {
  id: string;
  name: string;
  stack: number;
  folded: boolean;
  allIn: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
}

interface TableState {
  id: string;
  currentStreet: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  pot: number;
  players: TablePlayer[];
  communityCards: Array<{ id: string }>;
  currentTurn: string | null;
}

interface TableEventEnvelope {
  event: string;
  payload?: Record<string, unknown>;
}

const TABLE_ID = 'cash-aurora';

export default function TableScreen() {
  const { user, authToken, loading: authLoading } = useAuth();
  const [table, setTable] = useState<TableState | null>(null);
  const [betValue, setBetValue] = useState(20);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const reconnectTokenRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef(false);

  const wsUrl = useMemo(() => `${resolveWebSocketBaseUrl()}/ws`, []);
  const quickBets = useMemo(
    () => [
      { label: 'Min', value: 20 },
      { label: '1/2 Pot', value: 70 },
      { label: 'Pot', value: 140 },
      { label: 'Max', value: 320 },
    ],
    []
  );

  useEffect(() => {
    if (!user || !authToken) return;
    let active = true;
    manualCloseRef.current = false;

    const connect = async (useReconnectToken = false): Promise<void> => {
      try {
        await postJson(
          `/api/tables/${TABLE_ID}/join`,
          { buyIn: 0 },
          { headers: { authorization: `Bearer ${authToken}` } }
        );
      } catch (joinError) {
        if (active) {
          setError(joinError instanceof Error ? joinError.message : 'Failed to join table.');
        }
        return;
      }

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        const payload = useReconnectToken && reconnectTokenRef.current
          ? { reconnectToken: reconnectTokenRef.current }
          : { authToken, tableId: TABLE_ID };
        socket.send(JSON.stringify({ event: 'auth', payload }));
      };

      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as TableEventEnvelope;
        if (message.event === 'auth_ok') {
          reconnectTokenRef.current = typeof message.payload?.reconnectToken === 'string' ? message.payload.reconnectToken : reconnectTokenRef.current;
          socket.send(JSON.stringify({ event: 'subscribe_table', payload: { tableId: TABLE_ID } }));
          setConnected(true);
          setError(null);
          return;
        }

        if (message.event === 'reconnect_ok') {
          socket.send(JSON.stringify({ event: 'subscribe_table', payload: { tableId: TABLE_ID } }));
          setConnected(true);
          return;
        }

        if (message.event === 'table_sync' || message.event === 'table_update' || message.event === 'street_update') {
          setTable(message.payload?.table as TableState);
          return;
        }

        if (message.event === 'turn_timer_started') {
          const expiresAt = Number(message.payload?.expiresAt ?? 0);
          if (!expiresAt) return;
          const next = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
          setCountdown(next);
          return;
        }

        if (message.event === 'turn_action_timed_out' || message.event === 'player_timed_out') {
          setCountdown(null);
          void triggerFeedback(hapticsEnabled, 'warning');
          return;
        }

        if (message.event === 'error') {
          setError(String(message.payload?.message ?? 'Unknown websocket error.'));
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (!manualCloseRef.current && reconnectTokenRef.current) {
          void connect(true);
        }
      };

      socket.onerror = () => {
        setError('Realtime connection failed.');
      };
    };

    void connect();

    return () => {
      active = false;
      manualCloseRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [authToken, user, wsUrl, hapticsEnabled]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = setInterval(() => {
      setCountdown((current) => {
        if (current === null) return null;
        return current <= 1 ? 0 : current - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  async function triggerFeedback(enabled: boolean, kind: 'selection' | 'success' | 'warning'): Promise<void> {
    if (!enabled) return;
    try {
      if (kind === 'success') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      if (kind === 'warning') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      await Haptics.selectionAsync();
    } catch {
      // Ignore unsupported device haptics failures.
    }
  }

  function sendAction(type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in', amount?: number): void {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError('Realtime connection is not ready.');
      return;
    }

    socketRef.current.send(
      JSON.stringify({
        event: 'player_action',
        payload: {
          tableId: TABLE_ID,
          action: amount !== undefined ? { type, amount } : { type },
        },
      })
    );
    void triggerFeedback(hapticsEnabled, type === 'all-in' ? 'success' : 'selection');
  }

  const mySeat = table?.players.find((player) => player.id === user?.userId) ?? null;
  const communityCards = table?.communityCards.map((card) => card.id.toUpperCase()) ?? [];

  if (authLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Loading session...</Text>
      </View>
    );
  }

  if (!user || !authToken) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Sign in to join authenticated real-time tables.</Text>
        <Link href="/login" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryText}>Go to login</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>PLAY-MONEY BETA • AUTHENTICATED TABLE</Text>
        <Text style={styles.title}>Aurora Table • $0.05/$0.10</Text>
        <Text style={styles.subtitle}>Server-authoritative gameplay preview for App Store review. No real-money play is enabled in this build.</Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusText}>Connection: {connected ? 'Live' : 'Connecting'}</Text>
        <Text style={styles.statusText}>You: {user.username}</Text>
        <Text style={styles.statusText}>Current street: {table?.currentStreet ?? 'waiting'}</Text>
        <Text style={styles.statusText}>Turn: {table?.currentTurn ?? 'pending'}</Text>
        {countdown !== null ? <Text style={styles.timerText}>Action timer: {countdown}s</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.tableCard}>
        <Text style={styles.cardTitle}>Table state</Text>
        <Text style={styles.metric}>Pot: ${table?.pot.toFixed(2) ?? '0.00'}</Text>
        <Text style={styles.metric}>Community: {communityCards.length > 0 ? communityCards.join('  ') : 'Waiting for board cards'}</Text>
        <Text style={styles.metric}>Seat stack: {mySeat ? `$${mySeat.stack.toFixed(2)}` : 'Joining table...'}</Text>
      </View>

      <View style={styles.playersCard}>
        <Text style={styles.cardTitle}>Seats</Text>
        {(table?.players ?? []).map((seat) => (
          <View key={seat.id} style={styles.seatRow}>
            <Text style={styles.seatName}>{seat.name}{seat.isDealer ? ' • D' : ''}</Text>
            <Text style={styles.seatMeta}>
              ${seat.stack.toFixed(2)} • {seat.folded ? 'Folded' : seat.allIn ? 'All-in' : table?.currentTurn === seat.id ? 'Thinking' : 'Active'}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.audioPanel}>
        <View style={styles.audioRow}>
          <Text style={styles.audioLabel}>Dealer & table sounds</Text>
          <Switch value={soundEnabled} onValueChange={setSoundEnabled} trackColor={{ false: '#35435F', true: '#3E8FFF' }} />
        </View>
        <View style={styles.audioRow}>
          <Text style={styles.audioLabel}>Haptic feedback</Text>
          <Switch value={hapticsEnabled} onValueChange={setHapticsEnabled} trackColor={{ false: '#35435F', true: '#3E8FFF' }} />
        </View>
      </View>

      <View style={styles.controlsPanel}>
        <Text style={styles.raiseLabel}>Selected bet ${betValue.toFixed(2)}</Text>
        <View style={styles.quickRow}>
          {quickBets.map((quick) => (
            <Pressable key={quick.label} style={styles.quickButton} onPress={() => setBetValue(quick.value)}>
              <Text style={styles.quickText}>{quick.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actionsGrid}>
          <Pressable style={[styles.actionButton, styles.foldButton]} onPress={() => sendAction('fold')}>
            <Text style={styles.actionButtonText}>Fold</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => sendAction('check')}>
            <Text style={styles.actionButtonText}>Check</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => sendAction('call', betValue)}>
            <Text style={styles.actionButtonText}>Call</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.raiseButton]} onPress={() => sendAction('raise', betValue)}>
            <Text style={styles.actionButtonText}>Raise</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => sendAction('all-in', mySeat?.stack ?? betValue)}>
            <Text style={styles.actionButtonText}>All-in</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.footerLinks}>
        <Link href="/hand-verification" asChild>
          <Pressable style={styles.linkButton}>
            <Text style={styles.linkButtonText}>High Hand Highlights</Text>
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
  centered: { flex: 1, backgroundColor: '#050813', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  message: { color: '#D6E3FF', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  screen: { flex: 1, backgroundColor: '#050813' },
  content: { paddingHorizontal: 16, paddingTop: 44, paddingBottom: 28, gap: 14 },
  headerRow: { gap: 4 },
  eyebrow: { color: '#7ED3FF', fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  title: { color: '#F5F8FF', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#9EB0D2', fontSize: 13, lineHeight: 19 },
  statusCard: {
    backgroundColor: '#0F1730',
    borderColor: '#253454',
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    gap: 6,
  },
  statusText: { color: '#D9E5FF', fontSize: 13 },
  errorText: { color: '#FFB4B4', fontSize: 12, lineHeight: 18 },
  timerText: { color: '#7ED3FF', fontSize: 14, fontWeight: '700' },
  tableCard: {
    backgroundColor: '#0A1226',
    borderRadius: 24,
    borderColor: '#21304E',
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  playersCard: {
    backgroundColor: '#0E1730',
    borderWidth: 1,
    borderColor: '#243454',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  cardTitle: { color: '#F5F8FF', fontSize: 16, fontWeight: '700' },
  metric: { color: '#AFC4EA', fontSize: 13, lineHeight: 19 },
  seatRow: {
    borderWidth: 1,
    borderColor: '#243454',
    backgroundColor: '#111B34',
    borderRadius: 12,
    padding: 10,
    gap: 2,
  },
  seatName: { color: '#E7EEFF', fontSize: 14, fontWeight: '700' },
  seatMeta: { color: '#96B2E2', fontSize: 12 },
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
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quickButton: {
    borderColor: '#334D7B',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#13213E',
  },
  quickText: { color: '#D7E5FF', fontSize: 12, fontWeight: '700' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: {
    flexBasis: '31%',
    borderRadius: 12,
    backgroundColor: '#1C2D4F',
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#35527E',
  },
  foldButton: { backgroundColor: '#402133', borderColor: '#84506D' },
  raiseButton: { backgroundColor: '#17345B', borderColor: '#4C86D3' },
  actionButtonText: { color: '#F5F8FF', fontWeight: '700', fontSize: 13 },
  footerLinks: { flexDirection: 'row', gap: 10 },
  linkButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#13213E',
    alignItems: 'center',
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#334D7B',
  },
  linkButtonText: { color: '#E8F2FF', fontWeight: '700' },
  primaryButton: {
    backgroundColor: '#3E8FFF',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
