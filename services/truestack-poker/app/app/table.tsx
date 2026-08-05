import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { ActionBar } from './components/ActionBar';
import { HoleCards } from './components/HoleCards';
import { BetChips, PotChips } from './components/Chips';
import { DealerStage } from './components/live-dealer/DealerStage';
import { useDealerController } from './components/live-dealer/dealerController';
import { useAuth } from './lib/auth';
import { getJson, postJson, resolveWebSocketBaseUrl } from './lib/api';
import { getPlayerCharacter, resolveCharacterId } from './lib/playerIdentity';
import { useTablePreferences } from './lib/tablePreferences';
import type { DeckColorMode } from './lib/theme';
import type { ActionKind, TablePlayer, TableState } from './lib/betting';

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
/** Mirrors the gateway's turnActionMs default; drives the action-bar timer bar. */
const TURN_ACTION_SECONDS = 20;

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
  /** The viewer's own hand. Only ever populated for the hero pod. */
  heroHoleCards: string[];
  deckMode: DeckColorMode;
  /** Cards per hand for this variant: 2 for Hold'em, 4 for Omaha. */
  holeCardCount: number;
  /** Most recent action this street, e.g. "RAISE $2". */
  lastAction?: string | null;
  /** Pod width in px. Scaled from the felt so nine seats fit a phone without colliding. */
  podWidth: number;
}

function SeatPod({
  player,
  isHero,
  isTurn,
  onSit,
  seated,
  characterId,
  verifiedHuman,
  heroHoleCards,
  deckMode,
  holeCardCount,
  lastAction,
  podWidth,
}: SeatPodProps): JSX.Element {
  if (!player) {
    const label = isHero ? 'Taking seat\u2026' : seated ? 'Open' : 'Sit here';
    return (
      <Pressable
        onPress={onSit}
        disabled={!onSit}
        style={({ pressed }) => [
          seatStyles.pod,
          { width: podWidth },
          seatStyles.emptyPod,
          !seated && !isHero && seatStyles.openPod,
          pressed && seatStyles.pressedPod,
        ]}
      >
        <View style={seatStyles.cardsRow}>
          <View style={[seatStyles.holeBack, seatStyles.holeBackTiltLeft]} />
          <View style={[seatStyles.holeBack, seatStyles.holeBackTiltRight]} />
        </View>
        <View style={[seatStyles.chairBack, seatStyles.emptyChairBack, !seated && !isHero && seatStyles.openChairBack]}>
          <View style={[seatStyles.emptyAvatar, !seated && !isHero && seatStyles.openAvatar]}>
            <Text style={seatStyles.emptyPlus}>+</Text>
          </View>
          <Text style={[seatStyles.emptyLabel, !seated && !isHero && seatStyles.openLabel]}>{label}</Text>
        </View>
        <View style={[seatStyles.chairSeat, !seated && !isHero && seatStyles.openChairSeat]} />
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
    <View style={[seatStyles.pod, { width: podWidth }, isHero && seatStyles.heroPod, isTurn && seatStyles.turnPod]}>
      {isTurn ? <PulseRing /> : null}
      <View style={seatStyles.cardsRow}>
        {!player.folded ? (
          // The hero sees their own hand face-up; every other seat stays face-down.
          <HoleCards
            cards={isHero ? heroHoleCards : []}
            deckMode={deckMode}
            faceDown={!isHero || heroHoleCards.length === 0}
            size={isHero ? 'md' : 'sm'}
            cardCount={holeCardCount}
          />
        ) : null}
      </View>
      {lastAction ? (
        <View style={seatStyles.lastActionPill}>
          <Text style={seatStyles.lastActionText}>{lastAction}</Text>
        </View>
      ) : null}
      <View style={[seatStyles.chairBack, isHero && seatStyles.heroChairBack]}>
        <View style={[seatStyles.avatar, { backgroundColor: character.aura, borderColor: character.accent }]}>
          <Text style={seatStyles.avatarEmoji}>{character.emoji}</Text>
          {verifiedHuman ? (
            <View style={seatStyles.trustShield}>
              <Text style={seatStyles.trustShieldText}>H</Text>
            </View>
          ) : null}
        </View>
        {player.isDealer ? (
          <View style={seatStyles.dealerButton}>
            <Text style={seatStyles.dealerButtonText}>D</Text>
          </View>
        ) : null}
        <View style={[seatStyles.nameTag, { borderColor: isHero ? '#F1C46E' : character.accent }]}>
          <Text style={seatStyles.name} numberOfLines={1}>
            {isHero ? 'You' : player.name}
          </Text>
        </View>
        {/* Simulated seats are labelled at the table so they never read as human. */}
        {player.isBot ? (
          <View style={seatStyles.botTag}>
            <Text style={seatStyles.botTagText}>BOT</Text>
          </View>
        ) : null}
        <View style={seatStyles.stackRow}>
          <ChipStack />
          <Text style={seatStyles.stack}>${player.stack.toFixed(0)}</Text>
        </View>
      </View>
      <View style={seatStyles.chairSeat} />
      <Text style={[seatStyles.status, isTurn && seatStyles.statusActive]}>{status}</Text>
    </View>
  );
}

export default function TableScreen() {
  const { user, authToken, loading: authLoading } = useAuth();
  const { preferences, setPreferences } = useTablePreferences();
  const [table, setTable] = useState<TableState | null>(null);
  const [holeCards, setHoleCards] = useState<string[]>([]);
  const [deckMode, setDeckMode] = useState<DeckColorMode>('fourColor');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroSlot, setHeroSlot] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Winner of the hand just settled, used to sweep the pot chips toward their seat.
  const [lastWinnerId, setLastWinnerId] = useState<string | null>(null);
  const [potPushKey, setPotPushKey] = useState(0);
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, PlayerIdentityProfile>>({});
  const [playerTrust, setPlayerTrust] = useState<Record<string, PlayerTrustSummary>>({});
  const reconnectTokenRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef(false);

  const wsUrl = useMemo(() => `${resolveWebSocketBaseUrl()}/ws`, []);
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

        // Private to this socket: only ever this player's own hand.
        if (message.event === 'hole_cards') {
          const cards = message.payload?.holeCards;
          setHoleCards(Array.isArray(cards) ? (cards as string[]).map((card) => String(card).toUpperCase()) : []);
          return;
        }

        if (message.event === 'hand_settled') {
          // The previous hand's cards are dead the moment it settles; the redeal sends
          // fresh ones, so clearing here avoids briefly showing a stale hand.
          setHoleCards([]);
          const settled = message.payload?.settled as { payouts?: Array<{ playerId: string }> } | undefined;
          const winner = settled?.payouts?.[0]?.playerId ?? null;
          setLastWinnerId(winner);
          // Keyed so back-to-back wins by the same player still replay the sweep.
          setPotPushKey((key) => key + 1);
          // Clear once the sweep has played, so the next hand starts from the centre.
          setTimeout(() => setLastWinnerId(null), 900);
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

  /**
   * Label for what a seat has committed this street. Chips in front of a player is the
   * single most-read piece of information at a live table, and reading it off
   * streetContribution keeps it true without a separate action feed.
   */
  function seatLastAction(player: TablePlayer): string | null {
    if (player.folded) return 'FOLD';
    if (player.allIn) return 'ALL-IN';
    if (!player.streetContribution) return null;
    const amount = player.streetContribution;
    const label = Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
    if (table && amount >= table.currentBet && table.currentBet > 0) return `BET ${label}`;
    return label;
  }

  const mySeat = table?.players.find((player) => player.id === user?.userId) ?? null;
  const communityCards = table?.communityCards.map((card) => card.id.toUpperCase()) ?? [];
  const verifiedSeatCount = Object.values(playerTrust).filter((trust) => trust.verifiedHuman).length;
  const boardSummary =
    communityCards.length > 0 ? `${communityCards.length} board card${communityCards.length === 1 ? '' : 's'} exposed` : 'Deck set for next hand';
  const dealerSkinLabel =
    preferences.dealerSkinId === 'classic-casino-dealer'
      ? 'Classic Casino'
      : preferences.dealerSkinId === 'luxury-tournament-dealer'
        ? 'Tournament'
        : preferences.dealerSkinId === 'modern-professional-dealer'
          ? 'Professional'
          : 'VIP';

  async function handleSit(index: number): Promise<void> {
    if (mySeat) {
      // Already seated: reposition the hero visually to the tapped open seat.
      setHeroSlot(index);
      void triggerFeedback(preferences.hapticFeedbackEnabled, 'selection');
      return;
    }
    try {
      const response = await postJson<{ table?: TableState; holeCards?: string[] }>(
        `/api/tables/${TABLE_ID}/join`,
        { buyIn: 0 },
        { headers: { authorization: `Bearer ${authToken ?? ''}` } }
      );
      setHeroSlot(index);
      if (response?.table) setTable(response.table);
      // Seats are taken over HTTP, so the hand arrives in this response rather than
      // over the socket; without it the player sits blind until the next deal.
      if (Array.isArray(response?.holeCards)) {
        setHoleCards(response.holeCards.map((card) => String(card).toUpperCase()));
      }
      setError(null);
      void triggerFeedback(preferences.hapticFeedbackEnabled, 'success');
    } catch (sitError) {
      setError(sitError instanceof Error ? sitError.message : 'Failed to take seat.');
    }
  }

  // Every hook must run before the early returns below. Placing useDealerController after
  // them meant the loading render called fewer hooks than the signed-in render, and React
  // threw "Rendered more hooks than during the previous render" the moment auth resolved.
  const dealerCue = useDealerController(table, connected);

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
  // Nine pods ring the felt; at 80px fixed they overlapped badly on a phone. Scaling with
  // the felt keeps them legible on a tablet and non-colliding on a narrow screen.
  const podWidth = Math.max(52, Math.min(80, Math.round(tableWidth / 4.8)));
  const seated = !!mySeat;
  const heroCharacter = getPlayerCharacter(user.playerCharacter);
  const effectiveHeroSlot = seated ? heroSlot ?? 0 : null;
  const opponents = (table?.players ?? []).filter((player) => player.id !== user.userId);
  let oppCursor = 0;
  const seatAssignments = SEAT_SLOTS.slice(0, MAX_SEATS).map((slot, index) => {
    if (effectiveHeroSlot === index) return { slot, player: mySeat, isHero: true };
    const player = opponents[oppCursor] ?? null;
    if (player) oppCursor += 1;
    return { slot, player, isHero: false };
  });
  // Offset from the pot to the winner's seat, in felt pixels. The pot sits at roughly
  // (0.5, 0.46) of the felt, so this is simply the delta to that seat's slot.
  const winnerSlot = lastWinnerId
    ? seatAssignments.find(({ player }) => player?.id === lastWinnerId)?.slot ?? null
    : null;
  const potPush = winnerSlot
    ? { x: (winnerSlot.x - 0.5) * tableWidth, y: (winnerSlot.y - 0.46) * tableHeight }
    : null;

  const occupiedSeatTargets = seatAssignments
    .filter((assignment): assignment is typeof assignment & { player: TablePlayer } => !!assignment.player)
    .map(({ slot, player }) => ({
      id: player.id,
      x: slot.x * tableWidth,
      y: slot.y * tableHeight,
    }));

  return (
    <View style={styles.root}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Aurora Table</Text>
          <Text style={styles.headerStakes}>
            {table?.variant === 'plo' ? 'PLO' : 'NLH'} • $0.05/$0.10 • Play-money beta
          </Text>
        </View>
        <Pressable style={styles.gearButton} onPress={() => setSettingsOpen((open) => !open)}>
          <Text style={styles.gearText}>⚙</Text>
        </Pressable>
      </View>

      <View style={styles.tableStrip}>
        <View style={styles.windowDotRow}>
          <View style={[styles.liveDot, connected && styles.liveDotOn]} />
          <Text style={styles.stripText}>{connected ? 'LIVE TABLE' : 'CONNECTING'}</Text>
        </View>
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

      <View style={styles.roomStage}>
        <View style={styles.skylineBand}>
          <View style={styles.palmShadowLeft} />
          <View style={styles.palmShadowRight} />
          <View style={styles.balconyRail} />
          <View style={styles.balconyPostsRow}>
            {[0, 1, 2, 3, 4, 5].map((post) => (
              <View key={post} style={styles.balconyPost} />
            ))}
          </View>
        </View>

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
              <Text style={feltStyles.brandText}>T S</Text>
              <Text style={feltStyles.brandSub}>PRIVATE TABLE ROOM</Text>
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
                {/* Real chips in the middle, sized by the pot, that sweep to the winner. */}
                <PotChips amount={table?.pot ?? 0} pushTo={potPush} pushKey={potPushKey} />
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

            {/* Chips each player has pushed forward this street, drawn between their seat
                and the pot so the table reads the way a live one does. */}
            {seatAssignments.map(({ slot, player }, index) =>
              player && player.streetContribution > 0 ? (
                <View
                  key={`bet-${index}`}
                  pointerEvents="none"
                  style={[
                    feltStyles.betAnchor,
                    {
                      left: (slot.x + (0.5 - slot.x) * 0.3) * tableWidth - 26,
                      top: (slot.y + (0.46 - slot.y) * 0.32) * tableHeight - 10,
                    },
                  ]}
                >
                  <BetChips amount={player.streetContribution} />
                </View>
              ) : null
            )}

            {seatAssignments.map(({ slot, player, isHero }, index) => (
              <View
                key={index}
                style={[
                  feltStyles.seatAnchor,
                  { left: slot.x * tableWidth - podWidth / 2, top: slot.y * tableHeight - 56 },
                ]}
              >
                <SeatPod
                  player={player}
                  isHero={isHero}
                  isTurn={!!player && table?.currentTurn === player.id}
                  seated={seated}
                  characterId={player ? playerProfiles[player.id]?.customization.playerCharacter : null}
                  verifiedHuman={player ? playerTrust[player.id]?.verifiedHuman : false}
                  heroHoleCards={isHero ? holeCards : []}
                  deckMode={deckMode}
                  holeCardCount={table?.variant === 'plo' ? 4 : 2}
                  lastAction={player ? seatLastAction(player) : null}
                  podWidth={podWidth}
                  onSit={!player ? () => void handleSit(index) : undefined}
                />
              </View>
            ))}
          </View>
        </View>
      </View>

      {settingsOpen ? (
        <View style={styles.consoleShelf}>
          <View style={styles.audioPanel}>
            <Text style={styles.consoleTitle}>Sound & Atmosphere</Text>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>3D dealer</Text>
              <Switch value={preferences.liveDealerEnabled} onValueChange={(value) => setPreferences({ liveDealerEnabled: value })} trackColor={{ false: '#7B746A', true: '#E1B847' }} />
            </View>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>Dealer & table sounds</Text>
              <Switch value={preferences.soundEffectsEnabled} onValueChange={(value) => setPreferences({ soundEffectsEnabled: value })} trackColor={{ false: '#7B746A', true: '#E1B847' }} />
            </View>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>Ambient effects</Text>
              <Switch value={preferences.ambientEffectsEnabled} onValueChange={(value) => setPreferences({ ambientEffectsEnabled: value })} trackColor={{ false: '#7B746A', true: '#E1B847' }} />
            </View>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>Haptic feedback</Text>
              <Switch value={preferences.hapticFeedbackEnabled} onValueChange={(value) => setPreferences({ hapticFeedbackEnabled: value })} trackColor={{ false: '#7B746A', true: '#E1B847' }} />
            </View>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>Four-colour deck</Text>
              <Switch
                value={deckMode === 'fourColor'}
                onValueChange={(value) => setDeckMode(value ? 'fourColor' : 'twoColor')}
                trackColor={{ false: '#7B746A', true: '#E1B847' }}
              />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.railConsole}>
        <View style={styles.railTabs}>
          <Text style={[styles.railTab, styles.railTabActive]}>Session</Text>
          <Text style={styles.railTab}>Trust</Text>
          <Text style={styles.railTab}>Dealer Booth</Text>
        </View>
        <View style={styles.railGrid}>
          <View style={styles.railCard}>
            <Text style={styles.railCardLabel}>Hand log</Text>
            <Text style={styles.railCardValue}>{boardSummary}</Text>
            <Text style={styles.railCardMeta}>Street {(table?.currentStreet ?? 'waiting').toUpperCase()} • Pot ${table?.pot.toFixed(2) ?? '0.00'}</Text>
          </View>
          <View style={styles.railCard}>
            <Text style={styles.railCardLabel}>Roster check</Text>
            <Text style={styles.railCardValue}>{verifiedSeatCount} verified human seat{verifiedSeatCount === 1 ? '' : 's'}</Text>
            <Text style={styles.railCardMeta}>{table?.players.length ?? 0} players tracked • {connected ? 'live connection stable' : 'reconnecting session'}</Text>
          </View>
          <View style={styles.railCard}>
            <Text style={styles.railCardLabel}>Dealer booth</Text>
            <Text style={styles.railCardValue}>{preferences.liveDealerEnabled ? `${dealerSkinLabel} dealer active` : 'Virtual dealer active'}</Text>
            <Text style={styles.railCardMeta}>{preferences.liveDealerQuality === 'auto' ? 'Auto quality' : `${preferences.liveDealerQuality} quality`} • dealer stays behind the board</Text>
          </View>
        </View>
        <View style={styles.ledgerStrip}>
          <Text style={styles.ledgerText}>TABLE {TABLE_ID.toUpperCase()}</Text>
          <Text style={styles.ledgerDivider}>{'\u2022'}</Text>
          <Text style={styles.ledgerText}>HERO {effectiveHeroSlot !== null ? `SEAT ${effectiveHeroSlot + 1}` : 'RAIL'}</Text>
          <Text style={styles.ledgerDivider}>{'\u2022'}</Text>
          <Text style={styles.ledgerText}>{preferences.soundEffectsEnabled ? 'SFX ON' : 'SFX OFF'}</Text>
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

      {/* Pinned outside the ScrollView: a 20s turn timer leaves no room to scroll for Fold. */}
      <ActionBar
        table={table}
        playerId={user.userId}
        seated={seated}
        countdown={countdown}
        turnActionSeconds={TURN_ACTION_SECONDS}
        onAction={sendAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#17090D' },
  centered: { flex: 1, backgroundColor: '#17090D', justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  message: { color: '#F3DCD2', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  screen: { flex: 1, backgroundColor: '#17090D' },
  content: { paddingHorizontal: 10, paddingTop: 32, paddingBottom: 16, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  headerMain: { flex: 1, gap: 2 },
  headerStakes: { color: '#B99D93', fontSize: 12, fontWeight: '600' },
  gearButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#4B2630',
    backgroundColor: '#221017',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearText: { color: '#F1C46E', fontSize: 17 },
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
  consoleShelf: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#8B857B',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#DAD7CF',
    shadowColor: '#261A14',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  consoleBezel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#C8C9CA',
    borderBottomWidth: 1,
    borderBottomColor: '#8B857B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  consoleBezelText: {
    color: '#37322D',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  consoleBezelMeta: {
    color: '#6F665D',
    fontSize: 11,
    fontWeight: '700',
  },
  roomStage: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#6C6457',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#BFC8D5',
  },
  skylineBand: {
    height: 132,
    backgroundColor: '#B9D7EC',
    position: 'relative',
  },
  palmShadowLeft: {
    position: 'absolute',
    left: 10,
    top: 8,
    width: 80,
    height: 62,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 40,
    backgroundColor: 'rgba(52, 95, 63, 0.28)',
    transform: [{ rotate: '-12deg' }],
  },
  palmShadowRight: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 86,
    height: 58,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 54,
    borderBottomLeftRadius: 46,
    backgroundColor: 'rgba(45, 90, 58, 0.24)',
    transform: [{ rotate: '10deg' }],
  },
  balconyRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 22,
    height: 14,
    backgroundColor: '#ECEAE4',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#8B857B',
  },
  balconyPostsRow: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balconyPost: {
    width: 12,
    height: 28,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundColor: '#EAE7E0',
    borderWidth: 1,
    borderColor: '#8B857B',
  },
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
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: '#DBD7D0',
    borderColor: '#8C867C',
    borderWidth: 1,
    borderRadius: 8,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  windowDotRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4A5A7A' },
  liveDotOn: { backgroundColor: '#4ADE80', shadowColor: '#4ADE80', shadowOpacity: 0.9, shadowRadius: 6 },
  stripText: { color: '#332E29', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  stripDivider: { color: '#7D756A', fontSize: 12 },
  stripTimer: { color: '#8F4B12', fontSize: 12, fontWeight: '900' },
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
    borderBottomWidth: 1,
    borderBottomColor: '#8B857B',
    backgroundColor: '#CDA03B',
    padding: 12,
    gap: 10,
  },
  consoleTitle: {
    color: '#39210E',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  audioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(251,237,183,0.36)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  audioLabel: { color: '#39210E', fontSize: 14, fontWeight: '800' },
  controlsPanel: {
    backgroundColor: '#D8A12B',
    padding: 12,
    gap: 10,
  },
  raiseLabel: { color: '#2E160A', fontSize: 16, fontWeight: '900' },
  sitHint: { color: '#5B2B08', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  disabledButton: { opacity: 0.4 },
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quickButton: {
    borderColor: '#956C14',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F3D17A',
  },
  quickText: { color: '#3B210B', fontSize: 12, fontWeight: '900' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionButton: {
    flexBasis: '31%',
    borderRadius: 6,
    backgroundColor: '#F7DE95',
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#956C14',
  },
  foldButton: { backgroundColor: '#8A6020', borderColor: '#6A4510' },
  raiseButton: { backgroundColor: '#F2C556', borderColor: '#A36E16' },
  actionButtonText: { color: '#2E160A', fontWeight: '900', fontSize: 13 },
  railConsole: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#8B857B',
    borderRadius: 10,
    backgroundColor: '#D7D4CC',
    overflow: 'hidden',
  },
  railTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    backgroundColor: '#D7D4CC',
  },
  railTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#C1BDB4',
    color: '#504941',
    fontSize: 11,
    fontWeight: '800',
  },
  railTabActive: {
    backgroundColor: '#F3E5B7',
    color: '#3B2C1B',
  },
  railGrid: {
    gap: 8,
    padding: 10,
    backgroundColor: '#F0EEE8',
  },
  railCard: {
    borderWidth: 1,
    borderColor: '#C3BCAE',
    borderRadius: 10,
    backgroundColor: '#FBFAF6',
    padding: 10,
    gap: 4,
  },
  railCardLabel: {
    color: '#8D6F3F',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  railCardValue: {
    color: '#352E27',
    fontSize: 15,
    fontWeight: '900',
  },
  railCardMeta: {
    color: '#6E655C',
    fontSize: 12,
    lineHeight: 16,
  },
  ledgerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C6C7C9',
    borderTopWidth: 1,
    borderTopColor: '#A39D92',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  ledgerText: {
    color: '#49433C',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  ledgerDivider: {
    color: '#827B73',
    fontSize: 11,
  },
  footerLinks: { flexDirection: 'row', gap: 10, marginHorizontal: 8 },
  linkButton: {
    flex: 1,
    borderRadius: 6,
    backgroundColor: '#DDD7CA',
    alignItems: 'center',
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#8B857B',
  },
  linkButtonText: { color: '#2F2A25', fontWeight: '900' },
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
    backgroundColor: '#0CB54E',
    borderWidth: 11,
    borderColor: '#5D341B',
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
    borderWidth: 2.5,
    borderColor: 'rgba(60,80,28,0.28)',
  },
  feltGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,170,0.12)',
  },
  feltInner: {
    position: 'absolute',
    top: '11%',
    left: '7%',
    right: '7%',
    bottom: '11%',
    borderWidth: 3,
    borderColor: 'rgba(29,124,48,0.24)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  brandMark: { position: 'absolute', alignItems: 'center', gap: 3 },
  brandText: { color: 'rgba(20,84,38,0.16)', fontSize: 56, fontWeight: '900', letterSpacing: 6 },
  brandSub: { color: 'rgba(21,80,34,0.18)', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  dealer: { position: 'absolute', width: 68, alignItems: 'center', gap: 3 },
  dealerStageAnchor: { position: 'absolute', overflow: 'hidden' },
  board: { position: 'absolute', alignItems: 'center', gap: 8 },
  potRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  potPill: {
    backgroundColor: 'rgba(39,25,14,0.72)',
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(240,210,120,0.5)',
  },
  potText: { color: '#FBE7A8', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  boardCards: { flexDirection: 'row', gap: 6 },
  streetText: {
    color: 'rgba(38,60,24,0.85)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  betAnchor: {
    position: 'absolute',
    width: 52,
    alignItems: 'center',
  },
  seatAnchor: { position: 'absolute', width: 80, alignItems: 'center' },
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
  botTag: {
    backgroundColor: '#2E2A46',
    borderColor: '#6E67A8',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
  },
  botTagText: { color: '#B9B2E8', fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  lastActionPill: {
    backgroundColor: '#3A1E22',
    borderColor: '#8A6A45',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 1,
  },
  lastActionText: { color: '#F1C46E', fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  pod: {
    width: 80,
    alignItems: 'center',
    gap: 1,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  heroPod: {},
  turnPod: {},
  emptyPod: {},
  openPod: {},
  pressedPod: { opacity: 0.6, transform: [{ scale: 0.96 }] },
  cardsRow: { flexDirection: 'row', gap: 4, height: 22, marginBottom: -2, zIndex: 2 },
  holeBack: { width: 16, height: 22, borderRadius: 2, backgroundColor: '#C61F2F', borderWidth: 1, borderColor: '#F6F0E4' },
  holeBackTiltLeft: { transform: [{ rotate: '-18deg' }] },
  holeBackTiltRight: { transform: [{ rotate: '16deg' }] },
  chairBack: {
    width: 74,
    minHeight: 76,
    borderRadius: 38,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#731B1D',
    borderWidth: 3,
    borderColor: '#B78A3A',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    paddingHorizontal: 5,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  heroChairBack: {
    borderColor: '#F1C46E',
    backgroundColor: '#882023',
  },
  emptyChairBack: {
    backgroundColor: 'rgba(84, 30, 31, 0.7)',
    borderStyle: 'dashed',
    borderColor: '#B78A3A',
  },
  openChairBack: {
    backgroundColor: '#6D3A1F',
    borderStyle: 'solid',
  },
  chairSeat: {
    width: 54,
    height: 18,
    marginTop: -4,
    borderRadius: 10,
    backgroundColor: '#C92B2E',
    borderWidth: 2,
    borderColor: '#B78A3A',
  },
  openChairSeat: {
    backgroundColor: '#9E6232',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarEmoji: { fontSize: 15, lineHeight: 17 },
  trustShield: {
    position: 'absolute',
    right: -3,
    bottom: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3A2414',
    borderWidth: 1,
    borderColor: '#E7C57D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustShieldText: { color: '#F9E8BD', fontSize: 7, fontWeight: '900' },
  dealerButton: {
    position: 'absolute',
    right: 2,
    top: 8,
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
  pulseRing: { position: 'absolute', top: 8, left: 1, right: 1, bottom: 16, borderRadius: 36, borderWidth: 2, borderColor: '#F1C46E' },
  nameTag: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: 'rgba(78,11,14,0.65)', borderWidth: 1, marginTop: -1 },
  name: { color: '#FFF4E7', fontSize: 10, fontWeight: '800', maxWidth: 64, textAlign: 'center' },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -1 },
  stack: { color: '#F8E0A0', fontSize: 10, fontWeight: '900' },
  status: { color: '#4E2B0D', fontSize: 9, fontWeight: '900', marginTop: 1 },
  statusActive: { color: '#7A2C00' },
  emptyAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6CC8B',
    borderStyle: 'dashed',
  },
  emptyPlus: { color: '#F5E0AA', fontSize: 18, fontWeight: '900' },
  emptyLabel: { color: '#F6E6C2', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  openAvatar: { borderColor: '#4ADE80', borderStyle: 'solid' },
  openLabel: { color: '#F5E0AA', fontWeight: '900' },
});
