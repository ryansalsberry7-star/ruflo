import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
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
const MAX_SEATS = 9;

// Seat centre positions as fractions of the felt, placed on the oval rim so pods
// hug the edge. Slot 0 is the hero, bottom-centre; the rest ring clockwise.
const SEAT_SLOTS = [
  { x: 0.5, y: 0.83 },
  { x: 0.2, y: 0.75 },
  { x: 0.09, y: 0.55 },
  { x: 0.13, y: 0.26 },
  { x: 0.35, y: 0.11 },
  { x: 0.65, y: 0.11 },
  { x: 0.87, y: 0.26 },
  { x: 0.91, y: 0.55 },
  { x: 0.8, y: 0.75 },
];

const SUIT_META: Record<string, { symbol: string; color: string }> = {
  S: { symbol: '\u2660', color: '#0B1220' },
  C: { symbol: '\u2663', color: '#0B1220' },
  H: { symbol: '\u2665', color: '#D6304A' },
  D: { symbol: '\u2666', color: '#D6304A' },
};

const AVATAR_COLORS = ['#3E8FFF', '#9B5CF6', '#22B07D', '#E0A83B', '#E0576B', '#3BB2E0'];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Fun animal characters give every seat a recognisable, playful identity.
const CHARACTERS = [
  '\uD83E\uDD8A', '\uD83D\uDC3C', '\uD83D\uDC2F', '\uD83E\uDD81',
  '\uD83D\uDC35', '\uD83D\uDC28', '\uD83D\uDC38', '\uD83E\uDD89',
  '\uD83D\uDC19', '\uD83D\uDC37', '\uD83D\uDC32', '\uD83E\uDD85',
  '\uD83D\uDC3A', '\uD83E\uDD9D', '\uD83D\uDC2E', '\uD83D\uDC30',
];

function characterFor(name: string): string {
  let hash = 7;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 131 + name.charCodeAt(i)) >>> 0;
  return CHARACTERS[hash % CHARACTERS.length];
}

function PlayingCard({ id, faceDown }: { id?: string; faceDown?: boolean }): JSX.Element {
  if (faceDown || !id) {
    return (
      <View style={[cardStyles.card, cardStyles.cardBack]}>
        <View style={cardStyles.cardBackPattern} />
      </View>
    );
  }
  const raw = id.toUpperCase();
  const suit = raw.slice(-1);
  const rank = raw.slice(0, -1) === 'T' ? '10' : raw.slice(0, -1);
  const meta = SUIT_META[suit] ?? { symbol: '?', color: '#0B1220' };
  return (
    <View style={cardStyles.card}>
      <Text style={[cardStyles.cardRank, { color: meta.color }]}>{rank}</Text>
      <Text style={[cardStyles.cardSuit, { color: meta.color }]}>{meta.symbol}</Text>
    </View>
  );
}

// Community cards slide + fade in as they are dealt.
function DealtCard({ id, index }: { id: string; index: number }): JSX.Element {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 260, delay: index * 70, useNativeDriver: false }).start();
  }, [anim, id, index]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
      }}
    >
      <PlayingCard id={id} />
    </Animated.View>
  );
}

// Cyan ring that pulses around the seat whose turn it is.
function PulseRing(): JSX.Element {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1100, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        seatStyles.pulseRing,
        {
          opacity: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.75, 0.15, 0] }),
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.18] }) }],
        },
      ]}
    />
  );
}

function ChipStack({ size = 'sm' }: { size?: 'sm' | 'lg' }): JSX.Element {
  const large = size === 'lg';
  const w = large ? 26 : 18;
  const h = large ? 7 : 5;
  return (
    <View style={{ width: w, height: h * 3 + 4, justifyContent: 'flex-end' }}>
      {['#E0576B', '#3E8FFF', '#E0A83B'].map((c, i) => (
        <View
          key={c}
          style={{
            position: 'absolute',
            bottom: i * (h - 1),
            width: w,
            height: h,
            borderRadius: h,
            backgroundColor: c,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.5)',
          }}
        />
      ))}
    </View>
  );
}

interface SeatPodProps {
  player: TablePlayer | null;
  isHero: boolean;
  isTurn: boolean;
  onSit?: () => void;
  seated: boolean;
}

function SeatPod({ player, isHero, isTurn, onSit, seated }: SeatPodProps): JSX.Element {
  if (!player) {
    const label = isHero ? 'Taking seat\u2026' : seated ? 'Open' : 'Sit here';
    return (
      <Pressable
        onPress={onSit}
        disabled={!onSit}
        style={({ pressed }) => [
          seatStyles.pod,
          seatStyles.emptyPod,
          !seated && !isHero && seatStyles.openPod,
          pressed && seatStyles.pressedPod,
        ]}
      >
        <View style={[seatStyles.emptyAvatar, !seated && !isHero && seatStyles.openAvatar]}>
          <Text style={seatStyles.emptyPlus}>+</Text>
        </View>
        <Text style={[seatStyles.emptyLabel, !seated && !isHero && seatStyles.openLabel]}>{label}</Text>
      </Pressable>
    );
  }
  const status = player.folded
    ? 'Folded'
    : player.allIn
      ? 'All-in'
      : isTurn
        ? 'Acting\u2026'
        : 'Active';
  return (
    <View style={[seatStyles.pod, isHero && seatStyles.heroPod, isTurn && seatStyles.turnPod]}>
      {isTurn ? <PulseRing /> : null}
      <View style={seatStyles.cardsRow}>
        {!player.folded ? (
          <>
            <View style={seatStyles.holeBack} />
            <View style={seatStyles.holeBack} />
          </>
        ) : null}
      </View>
      <View style={[seatStyles.avatar, { backgroundColor: avatarColor(player.name) }]}>
        <Text style={seatStyles.avatarEmoji}>{characterFor(player.name)}</Text>
        {player.isDealer ? (
          <View style={seatStyles.dealerButton}>
            <Text style={seatStyles.dealerButtonText}>D</Text>
          </View>
        ) : null}
      </View>
      <View style={[seatStyles.nameTag, { borderColor: isHero ? '#7ED3FF' : avatarColor(player.name) }]}>
        <Text style={seatStyles.name} numberOfLines={1}>
          {isHero ? 'You' : player.name}
        </Text>
      </View>
      <View style={seatStyles.stackRow}>
        <ChipStack />
        <Text style={seatStyles.stack}>${player.stack.toFixed(0)}</Text>
      </View>
      <Text style={[seatStyles.status, isTurn && seatStyles.statusActive]}>{status}</Text>
    </View>
  );
}

export default function TableScreen() {
  const { user, authToken, loading: authLoading } = useAuth();
  const [table, setTable] = useState<TableState | null>(null);
  const [betValue, setBetValue] = useState(20);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroSlot, setHeroSlot] = useState<number | null>(null);
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
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    if (!user || !authToken) return;
    let active = true;
    manualCloseRef.current = false;

    const connect = async (useReconnectToken = false): Promise<void> => {
      // Connect as a spectator; the player takes a seat by tapping an open pod.
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

  async function handleSit(index: number): Promise<void> {
    if (mySeat) {
      // Already seated: reposition the hero visually to the tapped open seat.
      setHeroSlot(index);
      void triggerFeedback(hapticsEnabled, 'selection');
      return;
    }
    try {
      const response = await postJson<{ table?: TableState }>(
        `/api/tables/${TABLE_ID}/join`,
        { buyIn: 0 },
        { headers: { authorization: `Bearer ${authToken ?? ''}` } }
      );
      setHeroSlot(index);
      if (response?.table) setTable(response.table);
      setError(null);
      void triggerFeedback(hapticsEnabled, 'success');
    } catch (sitError) {
      setError(sitError instanceof Error ? sitError.message : 'Failed to take seat.');
    }
  }

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

  const tableWidth = Math.min(windowWidth - 20, 600);
  const tableHeight = Math.round(tableWidth * 0.72);
  const seated = !!mySeat;
  const effectiveHeroSlot = seated ? heroSlot ?? 0 : null;
  const opponents = (table?.players ?? []).filter((player) => player.id !== user.userId);
  let oppCursor = 0;
  const seatAssignments = SEAT_SLOTS.slice(0, MAX_SEATS).map((slot, index) => {
    if (effectiveHeroSlot === index) return { slot, player: mySeat, isHero: true };
    const player = opponents[oppCursor] ?? null;
    if (player) oppCursor += 1;
    return { slot, player, isHero: false };
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>PLAY-MONEY BETA • AUTHENTICATED TABLE</Text>
        <Text style={styles.title}>Aurora Table • $0.05/$0.10</Text>
        <Text style={styles.subtitle}>Play-money preview • server-dealt • no real-money wagering in this build.</Text>
      </View>

      <View style={styles.tableStrip}>
        <View style={[styles.liveDot, connected && styles.liveDotOn]} />
        <Text style={styles.stripText}>{connected ? 'LIVE' : 'CONNECTING'}</Text>
        <Text style={styles.stripDivider}>{'\u2022'}</Text>
        <Text style={styles.stripText}>{(table?.currentStreet ?? 'WAITING').toUpperCase()}</Text>
        <Text style={styles.stripDivider}>{'\u2022'}</Text>
        <Text style={styles.stripText}>{table?.players.length ?? 0}/{MAX_SEATS} SEATED</Text>
        {countdown !== null ? (
          <>
            <Text style={styles.stripDivider}>{'\u2022'}</Text>
            <Text style={styles.stripTimer}>{countdown}s</Text>
          </>
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.feltWrap}>
        <View
          style={[
            feltStyles.felt,
            { width: tableWidth, height: tableHeight, borderRadius: tableHeight / 2 },
          ]}
        >
          <View style={[feltStyles.feltRim, { borderRadius: tableHeight / 2 }]} />
          <View
            pointerEvents="none"
            style={[
              feltStyles.feltGlow,
              {
                width: tableWidth * 0.72,
                height: tableHeight * 0.58,
                borderRadius: tableHeight,
                left: tableWidth * 0.14,
                top: tableHeight * 0.18,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[feltStyles.feltInner, { borderRadius: tableHeight / 2 }]}
          />
          <View pointerEvents="none" style={[feltStyles.brandMark, { top: tableHeight * 0.52, width: tableWidth }]}>
            <Text style={feltStyles.brandText}>TRUE STACK</Text>
            <Text style={feltStyles.brandSub}>{'\u2660  P O K E R  \u2660'}</Text>
          </View>

          <View style={[feltStyles.dealer, { left: tableWidth * 0.5 - 34, top: tableHeight * 0.26 - 26 }]}>
            <View style={feltStyles.dealerAvatar}>
              <Text style={feltStyles.dealerEmoji}>{'\uD83E\uDD35'}</Text>
            </View>
            <Text style={feltStyles.dealerLabel}>Dealer</Text>
          </View>

          <View style={[feltStyles.board, { top: tableHeight * 0.44, width: tableWidth }]}>
            <View style={feltStyles.potRow}>
              <ChipStack size="lg" />
              <View style={feltStyles.potPill}>
                <Text style={feltStyles.potText}>Pot ${table?.pot.toFixed(2) ?? '0.00'}</Text>
              </View>
            </View>
            <View style={feltStyles.boardCards}>
              {communityCards.length > 0
                ? communityCards.map((card, index) => <DealtCard key={`${card}-${index}`} id={card} index={index} />)
                : [0, 1, 2, 3, 4].map((slot) => <PlayingCard key={slot} faceDown />)}
            </View>
            <Text style={feltStyles.streetText}>{(table?.currentStreet ?? 'waiting').toUpperCase()}</Text>
          </View>

          {seatAssignments.map(({ slot, player, isHero }, index) => (
            <View
              key={index}
              style={[
                feltStyles.seatAnchor,
                { left: slot.x * tableWidth - 32, top: slot.y * tableHeight - 44 },
              ]}
            >
              <SeatPod
                player={player}
                isHero={isHero}
                isTurn={!!player && table?.currentTurn === player.id}
                seated={seated}
                onSit={!player ? () => void handleSit(index) : undefined}
              />
            </View>
          ))}
        </View>
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
        {seated ? (
          <Text style={styles.raiseLabel}>Selected bet ${betValue.toFixed(2)}</Text>
        ) : (
          <Text style={styles.sitHint}>Tap an open seat to join the table</Text>
        )}
        <View style={styles.quickRow}>
          {quickBets.map((quick) => (
            <Pressable key={quick.label} disabled={!seated} style={[styles.quickButton, !seated && styles.disabledButton]} onPress={() => setBetValue(quick.value)}>
              <Text style={styles.quickText}>{quick.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actionsGrid}>
          <Pressable disabled={!seated} style={[styles.actionButton, styles.foldButton, !seated && styles.disabledButton]} onPress={() => sendAction('fold')}>
            <Text style={styles.actionButtonText}>Fold</Text>
          </Pressable>
          <Pressable disabled={!seated} style={[styles.actionButton, !seated && styles.disabledButton]} onPress={() => sendAction('check')}>
            <Text style={styles.actionButtonText}>Check</Text>
          </Pressable>
          <Pressable disabled={!seated} style={[styles.actionButton, !seated && styles.disabledButton]} onPress={() => sendAction('call', betValue)}>
            <Text style={styles.actionButtonText}>Call</Text>
          </Pressable>
          <Pressable disabled={!seated} style={[styles.actionButton, styles.raiseButton, !seated && styles.disabledButton]} onPress={() => sendAction('raise', betValue)}>
            <Text style={styles.actionButtonText}>Raise</Text>
          </Pressable>
          <Pressable disabled={!seated} style={[styles.actionButton, !seated && styles.disabledButton]} onPress={() => sendAction('all-in', mySeat?.stack ?? betValue)}>
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
  centered: { flex: 1, backgroundColor: '#2A0C12', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  message: { color: '#F3DCD2', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  screen: { flex: 1, backgroundColor: '#2A0C12' },
  content: { paddingHorizontal: 10, paddingTop: 40, paddingBottom: 8, gap: 12 },
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
  errorText: { color: '#FFB4B4', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  timerText: { color: '#7ED3FF', fontSize: 14, fontWeight: '700' },
  tableStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#0F1730',
    borderColor: '#243454',
    borderWidth: 1,
    borderRadius: 999,
    alignSelf: 'center',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4A5A7A' },
  liveDotOn: { backgroundColor: '#4ADE80', shadowColor: '#4ADE80', shadowOpacity: 0.9, shadowRadius: 6 },
  stripText: { color: '#D9E5FF', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  stripDivider: { color: '#3F5170', fontSize: 12 },
  stripTimer: { color: '#7ED3FF', fontSize: 12, fontWeight: '800' },
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
  sitHint: { color: '#7ED3FF', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  disabledButton: { opacity: 0.4 },
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
  feltWrap: { alignItems: 'center', paddingBottom: 14 },
});

const feltStyles = StyleSheet.create({
  felt: {
    position: 'relative',
    backgroundColor: '#0C6B3F',
    borderWidth: 10,
    borderColor: '#5A3A22',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  feltRim: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(244,228,170,0.22)',
  },
  feltGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(120,255,190,0.10)',
  },
  feltInner: {
    position: 'absolute',
    top: '11%',
    left: '7%',
    right: '7%',
    bottom: '11%',
    borderWidth: 2,
    borderColor: 'rgba(244,228,170,0.18)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  brandMark: { position: 'absolute', alignItems: 'center', gap: 3 },
  brandText: { color: 'rgba(255,255,255,0.10)', fontSize: 26, fontWeight: '900', letterSpacing: 5 },
  brandSub: { color: 'rgba(255,255,255,0.09)', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  dealer: { position: 'absolute', width: 68, alignItems: 'center', gap: 3 },
  dealerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#12233C',
    borderWidth: 2,
    borderColor: '#EBD9B4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerEmoji: { fontSize: 22 },
  dealerLabel: {
    color: '#F3E7C6',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  board: { position: 'absolute', alignItems: 'center', gap: 8 },
  potRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  potPill: {
    backgroundColor: 'rgba(4,14,10,0.7)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(240,210,120,0.5)',
  },
  potText: { color: '#FBE7A8', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  boardCards: { flexDirection: 'row', gap: 6 },
  streetText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  seatAnchor: { position: 'absolute', width: 64, alignItems: 'center' },
  tableCaption: { color: '#8FA6CC', fontSize: 12, textAlign: 'center', marginTop: 30 },
});

const cardStyles = StyleSheet.create({
  card: {
    width: 34,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: '#C7D2E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardRank: { fontSize: 15, fontWeight: '800', lineHeight: 17 },
  cardSuit: { fontSize: 15, lineHeight: 17 },
  cardBack: { backgroundColor: '#17345B', borderColor: '#4C86D3' },
  cardBackPattern: {
    width: 22,
    height: 34,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(126,211,255,0.55)',
    backgroundColor: 'rgba(62,143,255,0.25)',
  },
});

const seatStyles = StyleSheet.create({
  pod: {
    width: 64,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(8,16,32,0.82)',
    borderWidth: 1,
    borderColor: '#23324E',
  },
  heroPod: { borderColor: '#3E8FFF', backgroundColor: 'rgba(20,40,74,0.92)' },
  turnPod: { borderColor: '#7ED3FF', shadowColor: '#7ED3FF', shadowOpacity: 0.7, shadowRadius: 8 },
  emptyPod: { borderStyle: 'dashed', borderColor: '#3C4E70', backgroundColor: 'rgba(8,16,32,0.5)' },
  openPod: { borderColor: '#4ADE80', backgroundColor: 'rgba(12,40,26,0.72)' },
  pressedPod: { opacity: 0.6, transform: [{ scale: 0.96 }] },
  cardsRow: { flexDirection: 'row', gap: 3, height: 24, marginBottom: 1 },
  holeBack: { width: 16, height: 23, borderRadius: 3, backgroundColor: '#17345B', borderWidth: 1, borderColor: '#4C86D3' },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  avatarEmoji: { fontSize: 18, lineHeight: 22 },
  dealerButton: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F5F8FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0B1220',
  },
  dealerButtonText: { color: '#0B1220', fontSize: 10, fontWeight: '900' },
  pulseRing: { position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, borderRadius: 14, borderWidth: 2, borderColor: '#7ED3FF' },
  nameTag: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: 'rgba(6,12,24,0.72)', borderWidth: 1, marginTop: 1 },
  name: { color: '#EAF1FF', fontSize: 11, fontWeight: '700', maxWidth: 56 },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  stack: { color: '#7ED3FF', fontSize: 11, fontWeight: '800' },
  status: { color: '#8299BE', fontSize: 10, fontWeight: '600' },
  statusActive: { color: '#7ED3FF' },
  emptyAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3C4E70',
    borderStyle: 'dashed',
  },
  emptyPlus: { color: '#5E77A6', fontSize: 20, fontWeight: '700' },
  emptyLabel: { color: '#6E86AE', fontSize: 10, fontWeight: '600' },
  openAvatar: { borderColor: '#4ADE80', borderStyle: 'solid' },
  openLabel: { color: '#8FE9B4', fontWeight: '800' },
});
