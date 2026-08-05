import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { DealerStage } from './components/live-dealer/DealerStage';
import { useDealerController } from './components/live-dealer/dealerController';
import { useAuth } from './lib/auth';
import { getJson, postJson, resolveWebSocketBaseUrl } from './lib/api';
import { getPlayerCharacter, resolveCharacterId } from './lib/playerIdentity';
import { useTablePreferences } from './lib/tablePreferences';

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

interface PlayerIdentityProfile {
  customization: {
    playerCharacter: string;
  };
}

interface PlayerTrustSummary {
  verifiedHuman: boolean;
  trustScore: number;
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
  characterId?: string | null;
  verifiedHuman?: boolean;
}

function SeatPod({ player, isHero, isTurn, onSit, seated, characterId, verifiedHuman }: SeatPodProps): JSX.Element {
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
  const character = getPlayerCharacter(resolveCharacterId(characterId, player.name));
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
      <View style={[seatStyles.avatar, { backgroundColor: character.aura, borderColor: character.accent }]}>
        <Text style={seatStyles.avatarEmoji}>{character.emoji}</Text>
        {verifiedHuman ? (
          <View style={seatStyles.trustShield}>
            <Text style={seatStyles.trustShieldText}>H</Text>
          </View>
        ) : null}
        {player.isDealer ? (
          <View style={seatStyles.dealerButton}>
            <Text style={seatStyles.dealerButtonText}>D</Text>
          </View>
        ) : null}
      </View>
      <View style={[seatStyles.nameTag, { borderColor: isHero ? '#F1C46E' : character.accent }]}>
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
  const { preferences, setPreferences } = useTablePreferences();
  const [table, setTable] = useState<TableState | null>(null);
  const [betValue, setBetValue] = useState(20);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroSlot, setHeroSlot] = useState<number | null>(null);
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, PlayerIdentityProfile>>({});
  const [playerTrust, setPlayerTrust] = useState<Record<string, PlayerTrustSummary>>({});
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
          void triggerFeedback(preferences.hapticFeedbackEnabled, 'warning');
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
      manualCloseRef.current = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [authToken, preferences.hapticFeedbackEnabled, user, wsUrl]);

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

  useEffect(() => {
    const playerIds = Array.from(new Set((table?.players ?? []).map((player) => player.id)));
    if (playerIds.length === 0) return;

    let active = true;

    async function loadPlayerMeta(): Promise<void> {
      try {
        const entries = await Promise.all(
          playerIds.map(async (playerId) => {
            const [profileResponse, trustResponse] = await Promise.all([
              getJson<{ profile: PlayerIdentityProfile }>(`/api/profiles/${playerId}`),
              getJson<{ trust: PlayerTrustSummary }>(`/api/trust/${playerId}`),
            ]);
            return [playerId, profileResponse.profile, trustResponse.trust] as const;
          })
        );

        if (!active) return;

        const nextProfiles: Record<string, PlayerIdentityProfile> = {};
        const nextTrust: Record<string, PlayerTrustSummary> = {};

        for (const [playerId, profile, trust] of entries) {
          nextProfiles[playerId] = profile;
          nextTrust[playerId] = trust;
        }

        setPlayerProfiles(nextProfiles);
        setPlayerTrust(nextTrust);
      } catch {
        if (!active) return;
      }
    }

    void loadPlayerMeta();

    return () => {
      active = false;
    };
  }, [table?.players]);

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
    void triggerFeedback(preferences.hapticFeedbackEnabled, type === 'all-in' ? 'success' : 'selection');
  }

  const mySeat = table?.players.find((player) => player.id === user?.userId) ?? null;
  const communityCards = table?.communityCards.map((card) => card.id.toUpperCase()) ?? [];

  async function handleSit(index: number): Promise<void> {
    if (mySeat) {
      // Already seated: reposition the hero visually to the tapped open seat.
      setHeroSlot(index);
      void triggerFeedback(preferences.hapticFeedbackEnabled, 'selection');
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
      void triggerFeedback(preferences.hapticFeedbackEnabled, 'success');
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
  const heroCharacter = getPlayerCharacter(user.playerCharacter);
  const dealerCue = useDealerController(table, connected);
  const effectiveHeroSlot = seated ? heroSlot ?? 0 : null;
  const opponents = (table?.players ?? []).filter((player) => player.id !== user.userId);
  let oppCursor = 0;
  const seatAssignments = SEAT_SLOTS.slice(0, MAX_SEATS).map((slot, index) => {
    if (effectiveHeroSlot === index) return { slot, player: mySeat, isHero: true };
    const player = opponents[oppCursor] ?? null;
    if (player) oppCursor += 1;
    return { slot, player, isHero: false };
  });
  const occupiedSeatTargets = seatAssignments
    .filter((assignment): assignment is typeof assignment & { player: TablePlayer } => !!assignment.player)
    .map(({ slot, player }) => ({
      id: player.id,
      x: slot.x * tableWidth,
      y: slot.y * tableHeight,
    }));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>PLAY-MONEY BETA • AUTHENTICATED TABLE</Text>
        <Text style={styles.title}>Aurora Table • $0.05/$0.10</Text>
        <Text style={styles.subtitle}>A brass-and-felt table view with chosen characters, trust markers, and server-authenticated seat presence.</Text>
      </View>

      <View style={styles.heroBanner}>
        <View style={[styles.heroBannerAvatar, { backgroundColor: heroCharacter.aura, borderColor: heroCharacter.accent }]}>
          <Text style={styles.heroBannerEmoji}>{heroCharacter.emoji}</Text>
          {user.trust.verifiedHuman ? (
            <View style={styles.heroShield}>
              <Text style={styles.heroShieldText}>H</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.heroBannerCopy}>
          <Text style={styles.heroBannerTitle}>{heroCharacter.name}</Text>
          <Text style={styles.heroBannerMeta}>{heroCharacter.title}</Text>
          <Text style={styles.heroBannerNote}>{user.trust.verifiedHuman ? 'Verified human shield is visible on your seat.' : 'Verification shield appears after human checks complete.'}</Text>
        </View>
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

          <View
            style={[
              feltStyles.dealerStageAnchor,
              {
                left: tableWidth * 0.19,
                top: tableHeight * 0.02,
                width: tableWidth * 0.62,
                height: tableHeight * 0.34,
              },
            ]}
          >
            <DealerStage
              cue={dealerCue}
              preferences={preferences}
              viewportWidth={windowWidth}
              tableWidth={tableWidth}
              tableHeight={tableHeight}
              seatTargets={occupiedSeatTargets}
            />
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
                { left: slot.x * tableWidth - 36, top: slot.y * tableHeight - 48 },
              ]}
            >
              <SeatPod
                player={player}
                isHero={isHero}
                isTurn={!!player && table?.currentTurn === player.id}
                seated={seated}
                characterId={player ? playerProfiles[player.id]?.customization.playerCharacter : null}
                verifiedHuman={player ? playerTrust[player.id]?.verifiedHuman : false}
                onSit={!player ? () => void handleSit(index) : undefined}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.audioPanel}>
        <View style={styles.audioRow}>
          <Text style={styles.audioLabel}>3D dealer</Text>
          <Switch value={preferences.liveDealerEnabled} onValueChange={(value) => setPreferences({ liveDealerEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
        <View style={styles.audioRow}>
          <Text style={styles.audioLabel}>Dealer & table sounds</Text>
          <Switch value={preferences.soundEffectsEnabled} onValueChange={(value) => setPreferences({ soundEffectsEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
        <View style={styles.audioRow}>
          <Text style={styles.audioLabel}>Ambient effects</Text>
          <Switch value={preferences.ambientEffectsEnabled} onValueChange={(value) => setPreferences({ ambientEffectsEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
        </View>
        <View style={styles.audioRow}>
          <Text style={styles.audioLabel}>Haptic feedback</Text>
          <Switch value={preferences.hapticFeedbackEnabled} onValueChange={(value) => setPreferences({ hapticFeedbackEnabled: value })} trackColor={{ false: '#5D3A44', true: '#F1C46E' }} />
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
  centered: { flex: 1, backgroundColor: '#17090D', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  message: { color: '#F3DCD2', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  screen: { flex: 1, backgroundColor: '#17090D' },
  content: { paddingHorizontal: 10, paddingTop: 32, paddingBottom: 16, gap: 14 },
  headerRow: { gap: 4, paddingHorizontal: 8 },
  eyebrow: { color: '#F1C46E', fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: '#FFF4E7', fontSize: 24, fontWeight: '900' },
  subtitle: { color: '#D2BCB4', fontSize: 13, lineHeight: 19 },
  heroBanner: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#5E3032',
    backgroundColor: '#2A1118',
    borderRadius: 24,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  heroBannerAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBannerEmoji: { fontSize: 30 },
  heroShield: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3A2414',
    borderWidth: 1,
    borderColor: '#E7C57D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroShieldText: { color: '#F9E8BD', fontSize: 11, fontWeight: '900' },
  heroBannerCopy: { flex: 1, gap: 2 },
  heroBannerTitle: { color: '#FFF4E7', fontSize: 18, fontWeight: '900' },
  heroBannerMeta: { color: '#F7D9A2', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  heroBannerNote: { color: '#D2BCB4', fontSize: 12, lineHeight: 17 },
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
    backgroundColor: '#241319',
    borderColor: '#6A4047',
    borderWidth: 1,
    borderRadius: 999,
    alignSelf: 'center',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4A5A7A' },
  liveDotOn: { backgroundColor: '#4ADE80', shadowColor: '#4ADE80', shadowOpacity: 0.9, shadowRadius: 6 },
  stripText: { color: '#F0DED0', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  stripDivider: { color: '#7A4A53', fontSize: 12 },
  stripTimer: { color: '#F1C46E', fontSize: 12, fontWeight: '900' },
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
    borderColor: '#4B2630',
    backgroundColor: '#221017',
    borderRadius: 18,
    padding: 12,
    gap: 10,
    marginHorizontal: 8,
  },
  audioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  audioLabel: { color: '#FFF4E7', fontSize: 14, fontWeight: '700' },
  controlsPanel: {
    borderWidth: 1,
    borderColor: '#4B2630',
    backgroundColor: '#221017',
    borderRadius: 20,
    padding: 12,
    gap: 10,
    marginHorizontal: 8,
  },
  raiseLabel: { color: '#FFF4E7', fontSize: 16, fontWeight: '800' },
  sitHint: { color: '#F1C46E', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  disabledButton: { opacity: 0.4 },
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quickButton: {
    borderColor: '#7A4A53',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#3C1D26',
  },
  quickText: { color: '#FFF0D8', fontSize: 12, fontWeight: '800' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: {
    flexBasis: '31%',
    borderRadius: 14,
    backgroundColor: '#3C1D26',
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7A4A53',
  },
  foldButton: { backgroundColor: '#4D1D27', borderColor: '#A55B65' },
  raiseButton: { backgroundColor: '#553710', borderColor: '#F1C46E' },
  actionButtonText: { color: '#FFF4E7', fontWeight: '800', fontSize: 13 },
  footerLinks: { flexDirection: 'row', gap: 10, marginHorizontal: 8 },
  linkButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#221017',
    alignItems: 'center',
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#7A4A53',
  },
  linkButtonText: { color: '#FFF4E7', fontWeight: '800' },
  primaryButton: {
    backgroundColor: '#F1C46E',
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  primaryText: { color: '#2A1118', fontSize: 16, fontWeight: '900' },
  feltWrap: { alignItems: 'center', paddingBottom: 14 },
});

const feltStyles = StyleSheet.create({
  felt: {
    position: 'relative',
    backgroundColor: '#0A5A38',
    borderWidth: 10,
    borderColor: '#6C4325',
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
    backgroundColor: 'rgba(228,201,131,0.10)',
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
  dealerStageAnchor: { position: 'absolute', overflow: 'hidden' },
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
  seatAnchor: { position: 'absolute', width: 72, alignItems: 'center' },
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
    width: 72,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(20,10,16,0.88)',
    borderWidth: 1,
    borderColor: '#5B323B',
  },
  heroPod: { borderColor: '#F1C46E', backgroundColor: 'rgba(45,21,29,0.96)' },
  turnPod: { borderColor: '#F1C46E', shadowColor: '#F1C46E', shadowOpacity: 0.45, shadowRadius: 8 },
  emptyPod: { borderStyle: 'dashed', borderColor: '#6A4047', backgroundColor: 'rgba(20,10,16,0.55)' },
  openPod: { borderColor: '#4ADE80', backgroundColor: 'rgba(12,40,26,0.72)' },
  pressedPod: { opacity: 0.6, transform: [{ scale: 0.96 }] },
  cardsRow: { flexDirection: 'row', gap: 3, height: 24, marginBottom: 1 },
  holeBack: { width: 16, height: 23, borderRadius: 3, backgroundColor: '#17345B', borderWidth: 1, borderColor: '#4C86D3' },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarEmoji: { fontSize: 20, lineHeight: 22 },
  trustShield: {
    position: 'absolute',
    right: -4,
    bottom: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#3A2414',
    borderWidth: 1,
    borderColor: '#E7C57D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustShieldText: { color: '#F9E8BD', fontSize: 8, fontWeight: '900' },
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
  pulseRing: { position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, borderRadius: 18, borderWidth: 2, borderColor: '#F1C46E' },
  nameTag: { borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: 'rgba(14,7,10,0.78)', borderWidth: 1, marginTop: 1 },
  name: { color: '#FFF4E7', fontSize: 11, fontWeight: '800', maxWidth: 60 },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  stack: { color: '#F1C46E', fontSize: 11, fontWeight: '900' },
  status: { color: '#D6B6A4', fontSize: 10, fontWeight: '700' },
  statusActive: { color: '#FFF4E7' },
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
  emptyPlus: { color: '#9F7A80', fontSize: 20, fontWeight: '700' },
  emptyLabel: { color: '#B69297', fontSize: 10, fontWeight: '700' },
  openAvatar: { borderColor: '#4ADE80', borderStyle: 'solid' },
  openLabel: { color: '#8FE9B4', fontWeight: '800' },
});
