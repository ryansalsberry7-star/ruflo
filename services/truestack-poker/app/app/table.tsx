import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionBar } from './components/ActionBar';
import { HoleCards } from './components/HoleCards';
import { StartingHandMatrix } from './components/StartingHandMatrix';
import { BetChips, PotChips } from './components/Chips';
import { TimerRing } from './components/TimerRing';
import { DealerStage } from './components/live-dealer/DealerStage';
import { useDealerController } from './components/live-dealer/dealerController';
import { useAuth } from './lib/auth';
import { getJson, postJson, resolveWebSocketBaseUrl } from './lib/api';
import { getPlayerCharacter, resolveCharacterId } from './lib/playerIdentity';
import { useTablePreferences } from './lib/tablePreferences';
import { colors, displayFont, displayFontSemibold, fontSize, numericFont } from './lib/theme';
import type { DeckColorMode } from './lib/theme';
import { formatChips, getLegalActions } from './lib/betting';
import type { ActionKind, GameVariant, TablePlayer, TableState } from './lib/betting';
import { estimateWinOdds } from './lib/winOdds';

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

/** VPIP/PFR opponent-read from the server -- null (from the API) until there's a
 *  meaningful sample this session, which /api/hud-stats/:id represents by omitting it. */
interface PlayerHudStats {
  hands: number;
  vpip: number;
  pfr: number;
}

const TABLE_ID = 'cash-aurora';
const MAX_SEATS = 9;
/** Mirrors the gateway's turnActionMs default; drives the action-bar timer bar. */
const TURN_ACTION_SECONDS = 20;

// Seat centre positions as fractions of the felt, placed on the oval rim so pods hug the
// edge. Slot 0 is the hero, bottom-centre; the rest ring clockwise at even 40° steps
// around an ellipse — the previous hand-tuned points bunched the side pairs (slots 1-2
// and 7-8) close enough together (~69px on a phone) that seats overlapped there even
// after shrinking pod width. Uniform angular spacing widens every gap to ~74-85px.
const SEAT_SLOTS = [
  { x: 0.5, y: 0.85 },
  { x: 0.23, y: 0.76 },
  { x: 0.086, y: 0.531 },
  { x: 0.136, y: 0.27 },
  { x: 0.356, y: 0.1 },
  { x: 0.644, y: 0.1 },
  { x: 0.864, y: 0.27 },
  { x: 0.914, y: 0.531 },
  { x: 0.77, y: 0.76 },
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
    // A slight overshoot-and-settle rather than a flat ease -- cards sliding in with
    // some weight behind them reads as "dealt", not just faded/translated into place.
    Animated.timing(anim, {
      toValue: 1,
      duration: 320,
      delay: index * 70,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: false,
    }).start();
  }, [anim, id, index]);
  return (
    <Animated.View
      style={{
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
      }}
    >
      <PlayingCard id={id} />
    </Animated.View>
  );
}

// Electric mint ring that pulses around the seat whose turn it is -- the "live/action"
// accent, reserved for exactly this kind of "this is happening now" cue.
/** Turn indicator by default (mint, slow loop). The winner's seat reuses this at a
 *  faster pace in the positive color -- same visual language, different meaning. */
function PulseRing({ color = colors.mint, duration = 1100 }: { color?: string; duration?: number }): JSX.Element {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(anim, { toValue: 1, duration, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [anim, duration]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        seatStyles.pulseRing,
        {
          borderColor: color,
          opacity: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.75, 0.15, 0] }),
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.18] }) }],
        },
      ]}
    />
  );
}

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'] as const;

/** Clean four-step progression instead of a single word -- reads at a glance where a
 *  hand stands without requiring the viewer to parse street names. */
function StreetTimeline({ street }: { street?: string }) {
  const idx = street === 'showdown' ? STREET_ORDER.length : Math.max(0, STREET_ORDER.indexOf(street as (typeof STREET_ORDER)[number]));
  return (
    <View style={feltStyles.streetTimeline}>
      {STREET_ORDER.map((step, index) => (
        <View key={step} style={feltStyles.streetTimelineItem}>
          <View style={[feltStyles.streetDot, index <= idx && feltStyles.streetDotDone]} />
          {index < STREET_ORDER.length - 1 ? (
            <View style={[feltStyles.streetLine, index < idx && feltStyles.streetLineDone]} />
          ) : null}
        </View>
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
  /** Hero's own Monte Carlo win-equity estimate, 0-100. Only ever populated for the hero pod. */
  winOdds?: number | null;
  /** True for ~900ms right after this seat takes down a pot -- drives the win-glow pulse. */
  isWinner?: boolean;
  /** Seconds left in this seat's turn, or null when it isn't this seat's turn. Drives
   *  the timer ring around the avatar. */
  turnCountdown?: number | null;
  /** Opponent VPIP/PFR read. Null for the hero (nothing to read about yourself
   *  mid-hand) and for anyone without a meaningful sample yet this session. */
  hudStats?: PlayerHudStats | null;
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
  winOdds,
  isWinner,
  turnCountdown,
  hudStats,
}: SeatPodProps): JSX.Element {
  // A fold should read as a decision, not a glitch -- cards slide away instead of
  // vanishing the instant `folded` flips true. HoleCards keeps rendering (still
  // face-down for opponents, so nothing is exposed) until the animation finishes.
  const folded = player?.folded ?? false;
  const cardFade = useRef(new Animated.Value(folded ? 0 : 1)).current;
  const [cardsMounted, setCardsMounted] = useState(!folded);
  const wasFoldedRef = useRef(folded);

  useEffect(() => {
    if (folded === wasFoldedRef.current) return;
    wasFoldedRef.current = folded;
    if (folded) {
      Animated.timing(cardFade, { toValue: 0, duration: 320, useNativeDriver: false }).start(() => setCardsMounted(false));
    } else {
      // Fresh hand dealt into this seat -- no fade-in needed, DealtCard/HoleCards
      // already own the deal entrance for the felt itself.
      cardFade.setValue(1);
      setCardsMounted(true);
    }
  }, [folded, cardFade]);

  if (!player) {
    const label = isHero ? 'Taking seat\u2026' : seated ? 'Open' : 'Sit here';
    const inviting = !seated && !isHero;
    return (
      <Pressable
        onPress={onSit}
        disabled={!onSit}
        style={({ pressed }) => [seatStyles.pod, { width: podWidth }, pressed && seatStyles.pressedPod]}
      >
        {/* No decorative card backs here — an empty seat has no cards, and at 9-max the
            extra height is what was making pods crowd their neighbors. */}
        <View style={[seatStyles.plate, { width: podWidth }, seatStyles.emptyPlate, inviting && seatStyles.invitingPlate]}>
          <View style={[seatStyles.emptyAvatar, inviting && seatStyles.invitingAvatar]}>
            <Text style={[seatStyles.emptyPlus, inviting && seatStyles.invitingPlus]}>+</Text>
          </View>
          <Text style={[seatStyles.emptyLabel, inviting && seatStyles.invitingLabel]}>{label}</Text>
        </View>
      </Pressable>
    );
  }
  // "Active" is the default/uninteresting state for most seats most of the time, so it's
  // omitted entirely rather than costing every seat a line of height for no information.
  const status = player.folded ? 'Folded' : player.allIn ? 'All-in' : isTurn ? 'Acting\u2026' : null;
  // VPIP/PFR shares the status line rather than adding a row of its own -- this pod has
  // fought height-crowding bugs before. A live status always wins when there is one;
  // the read is only worth showing in the dead space where nothing else is happening.
  const hudLabel = hudStats ? `${hudStats.vpip}/${hudStats.pfr}` : null;
  const character = getPlayerCharacter(resolveCharacterId(characterId, player.name));
  return (
    <View style={[seatStyles.pod, { width: podWidth }]}>
      {isTurn ? <PulseRing /> : null}
      {isWinner ? <PulseRing color={colors.positive} duration={650} /> : null}
      <Animated.View
        style={[
          seatStyles.cardsRow,
          { opacity: cardFade, transform: [{ translateY: cardFade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
        ]}
      >
        {cardsMounted ? (
          // The hero sees their own hand face-up; every other seat stays face-down.
          <HoleCards
            cards={isHero ? heroHoleCards : []}
            deckMode={deckMode}
            faceDown={!isHero || heroHoleCards.length === 0}
            size={isHero ? 'md' : 'sm'}
            cardCount={holeCardCount}
          />
        ) : null}
      </Animated.View>
      {lastAction ? (
        <View style={seatStyles.lastActionPill}>
          <Text style={seatStyles.lastActionText}>{lastAction}</Text>
        </View>
      ) : null}
      <View style={[seatStyles.plate, { width: podWidth }, isHero && seatStyles.heroPlate, isTurn && seatStyles.turnPlate]}>
        <View style={seatStyles.avatarWrap}>
          {/* Burns down over the seat's turn -- same footprint as the avatar ring itself
              (no extra layout weight for the other 8 seats that aren't acting), traced
              just outside its existing gold border. */}
          {isTurn && typeof turnCountdown === 'number' ? (
            <TimerRing
              size={20}
              strokeWidth={2}
              progress={Math.max(0, Math.min(1, turnCountdown / TURN_ACTION_SECONDS))}
              color={turnCountdown <= 5 ? colors.danger : colors.mint}
            />
          ) : null}
          <View style={seatStyles.avatarRing}>
            <View style={[seatStyles.avatarAccentRing, { borderColor: character.accent }]}>
              <View style={[seatStyles.avatar, { backgroundColor: character.aura }]}>
                <Text style={seatStyles.avatarEmoji}>{character.emoji}</Text>
              </View>
            </View>
            {/* Win odds rides on the avatar ring rather than its own row -- this pod already
                fought (and re-fought) a height-crowding bug, so a badge that overlaps space
                the ring already reserves costs nothing, unlike a fourth stacked block would. */}
            {isHero && typeof winOdds === 'number' ? (
              <View style={[seatStyles.winOddsBadge, { borderColor: winOdds >= 50 ? colors.positive : colors.fold }]}>
                <Text style={[seatStyles.winOddsBadgeText, { color: winOdds >= 50 ? colors.positive : colors.fold }]}>
                  {winOdds}%
                </Text>
              </View>
            ) : null}
            {verifiedHuman ? (
              <View style={seatStyles.trustShield}>
                <Text style={seatStyles.trustShieldText}>H</Text>
              </View>
            ) : null}
            {/* One badge slot for whichever position matters this hand -- dealer button
                takes priority (it's the physical object a table actually has); small/big
                blind fall back to a compact text badge in the same corner. */}
            {player.isDealer || player.isSmallBlind || player.isBigBlind ? (
              <View style={seatStyles.dealerButton}>
                <Text style={seatStyles.dealerButtonText}>{player.isDealer ? 'D' : player.isSmallBlind ? 'SB' : 'BB'}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={[seatStyles.nameTag, { borderColor: isHero ? colors.gold : character.accent }]}>
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
        {/* A flat, single-hue chip dot rather than the pot's photorealistic multi-denomination
            pile -- that many-hued art (7 casino colours) was fighting this app's restrained
            wine/gold identity at every seat, and is illegible at this size anyway. */}
        <View style={seatStyles.stackRow}>
          <View style={seatStyles.stackChipDot} />
          <Text style={seatStyles.stackAmount}>{formatChips(player.stack)}</Text>
        </View>
        {status ? (
          <Text style={[seatStyles.status, isTurn && seatStyles.statusActive]}>{status}</Text>
        ) : hudLabel ? (
          <Text style={[seatStyles.hudLabel, numericFont]}>{hudLabel}</Text>
        ) : null}
      </View>
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
  // Bets that were live the instant the street closed, swept into the pot instead of
  // just vanishing when the server zeroes streetContribution for the new street.
  const [streetSweepAmounts, setStreetSweepAmounts] = useState<Record<string, number>>({});
  const [streetSweepKey, setStreetSweepKey] = useState(0);
  const prevStreetRef = useRef<{ street: string | null; contributions: Record<string, number> }>({
    street: null,
    contributions: {},
  });
  const [playerProfiles, setPlayerProfiles] = useState<Record<string, PlayerIdentityProfile>>({});
  const [playerTrust, setPlayerTrust] = useState<Record<string, PlayerTrustSummary>>({});
  const [playerHudStats, setPlayerHudStats] = useState<Record<string, PlayerHudStats>>({});
  const reconnectTokenRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef(false);
  // Pot label gives a small confirming pulse whenever chips actually land in it, rather
  // than just silently re-rendering a bigger number.
  const potPulse = useRef(new Animated.Value(1)).current;
  const prevPotRef = useRef(0);

  useEffect(() => {
    const pot = table?.pot ?? 0;
    if (pot > prevPotRef.current) {
      potPulse.setValue(1);
      Animated.sequence([
        Animated.timing(potPulse, { toValue: 1.12, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.spring(potPulse, { toValue: 1, friction: 5, tension: 120, useNativeDriver: false }),
      ]).start();
    }
    prevPotRef.current = pot;
  }, [table?.pot, potPulse]);

  const wsUrl = useMemo(() => `${resolveWebSocketBaseUrl()}/ws`, []);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

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
            const [profileResponse, trustResponse, hudResponse] = await Promise.all([
              getJson<{ profile: PlayerIdentityProfile }>(`/api/profiles/${playerId}`),
              getJson<{ trust: PlayerTrustSummary }>(`/api/trust/${playerId}`),
              getJson<{ stats: PlayerHudStats | null }>(`/api/hud-stats/${playerId}`),
            ]);
            return [playerId, profileResponse.profile, trustResponse.trust, hudResponse.stats] as const;
          })
        );

        if (!active) return;

        const nextProfiles: Record<string, PlayerIdentityProfile> = {};
        const nextTrust: Record<string, PlayerTrustSummary> = {};
        const nextHudStats: Record<string, PlayerHudStats> = {};

        for (const [playerId, profile, trust, hudStats] of entries) {
          nextProfiles[playerId] = profile;
          nextTrust[playerId] = trust;
          if (hudStats) nextHudStats[playerId] = hudStats;
        }

        setPlayerProfiles(nextProfiles);
        setPlayerTrust(nextTrust);
        setPlayerHudStats(nextHudStats);
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

  // Live stats worth a player's attention mid-hand — nothing here duplicates what's
  // already visible on the felt (street, pot, seat count are shown there already).
  const totalSeated = table?.players.length ?? 0;
  const playersInHand = table?.players.filter((player) => !player.folded).length ?? 0;
  const heroStackBB = mySeat && table?.bigBlind ? mySeat.stack / table.bigBlind : null;
  // getLegalActions only returns a real amountToCall on the hero's own turn (it zeroes
  // everything out otherwise) — which is exactly when pot odds are an actionable number,
  // not just trivia, so this naturally disappears the rest of the time.
  const heroLegal = getLegalActions(table, user?.userId ?? null);
  const potOddsLabel =
    heroLegal.amountToCall > 0
      ? `${(((table?.pot ?? 0) + heroLegal.amountToCall) / heroLegal.amountToCall).toFixed(1)}:1`
      : null;

  // SPR and effective stack describe the hand's overall risk profile from the first
  // action, not just when facing a bet -- unlike pot odds, which is only actionable
  // information at the moment of a decision.
  const liveOpponentStacks = table
    ? table.players.filter((player) => player.id !== user?.userId && !player.folded).map((player) => player.stack)
    : [];
  const effectiveStack =
    mySeat && liveOpponentStacks.length > 0 ? Math.min(mySeat.stack, Math.max(...liveOpponentStacks)) : null;
  const showHandRisk = !!table && !!mySeat && !mySeat.folded && table.pot > 0 && effectiveStack !== null;
  const sprLabel = showHandRisk ? (effectiveStack! / table!.pot).toFixed(1) : null;
  const effectiveStackBBLabel =
    showHandRisk && table!.bigBlind ? `${(effectiveStack! / table!.bigBlind).toFixed(1)} BB` : null;

  const variant: GameVariant = table?.variant === 'plo' ? 'plo' : 'nlh';
  const heroInHand = !!mySeat && !mySeat.folded;
  const activeOpponentCount = table
    ? table.players.filter((player) => player.id !== user?.userId && !player.folded).length
    : 0;
  // Keyed on card contents rather than the (freshly-mapped, new-reference-every-render)
  // arrays themselves, so the Monte Carlo sim below only reruns when the hand actually
  // changes street or the hero's own cards change -- not on every unrelated table tick.
  const heroCardsKey = holeCards.join(',');
  const communityCardsKey = communityCards.join(',');

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

  // Win-odds is a Monte Carlo estimate run against the hero's *own* hole cards -- nobody
  // else's cards are ever delivered to this client, so there's nothing here another seat
  // could see even if they inspected this client's state.
  const winOdds = useMemo(() => {
    if (!heroInHand) return null;
    return estimateWinOdds({
      heroCards: holeCards,
      communityCards,
      opponentCount: activeOpponentCount,
      variant,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroCardsKey, communityCardsKey, activeOpponentCount, heroInHand, variant]);

  // The server zeroes streetContribution the instant a street closes, which otherwise
  // makes every player's bet chips just vanish. Snapshot whatever was live the moment
  // currentStreet actually changes and sweep it into the pot instead -- seat pixel
  // positions aren't known here (they need windowWidth-derived layout, computed below
  // the early returns), so this only decides *what* to sweep; the render below decides
  // *where*.
  useEffect(() => {
    const nextStreet = table?.currentStreet ?? null;
    const prev = prevStreetRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (prev.street && nextStreet && prev.street !== nextStreet) {
      const swept = Object.fromEntries(Object.entries(prev.contributions).filter(([, amount]) => amount > 0));
      if (Object.keys(swept).length > 0) {
        setStreetSweepAmounts(swept);
        setStreetSweepKey((key) => key + 1);
        timer = setTimeout(() => setStreetSweepAmounts({}), 650);
      }
    }
    prevStreetRef.current = {
      street: nextStreet,
      contributions: Object.fromEntries((table?.players ?? []).map((player) => [player.id, player.streetContribution])),
    };
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [table?.currentStreet, table?.players]);

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
  // Nine pods ring the felt. The tightest gap between adjacent seat slots (the left/right
  // side pairs) is ~70px on a typical phone width, so pods need to stay well under that —
  // the previous /4.8 divisor produced up to 80px pods that overlapped their neighbors.
  const podWidth = Math.max(42, Math.min(58, Math.round(tableWidth / 7)));
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
      <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Eirinn Poker Tables</Text>
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
        <View style={styles.roomVignette} pointerEvents="none" />

        <View style={styles.feltWrap}>
          <View
            style={[
              feltStyles.felt,
              { width: tableWidth, height: tableHeight, borderRadius: tableHeight / 2 },
            ]}
          >
            <View pointerEvents="none" style={[feltStyles.feltPinstripe, { borderRadius: tableHeight / 2 }]} />
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
              <Text style={feltStyles.brandText}>E P</Text>
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

            <View style={[feltStyles.board, { top: tableHeight * 0.3 }]}>
              <Animated.View style={[feltStyles.potPill, { transform: [{ scale: potPulse }] }]}>
                <Text style={feltStyles.potLabel}>
                  Pot <Text style={feltStyles.potText}>${table?.pot.toFixed(2) ?? '0.00'}</Text>
                </Text>
              </Animated.View>
              {/* Real chips, sized by the pot, that sweep to the winner. Centered under
                  the label rather than sharing a row with it, so the pile itself sits in
                  the middle of the felt instead of hugging one side of the row. */}
              <PotChips amount={table?.pot ?? 0} pushTo={potPush} pushKey={potPushKey} />
              <View style={feltStyles.boardCards}>
                {communityCards.length > 0
                  ? communityCards.map((card, index) => <DealtCard key={`${card}-${index}`} id={card} index={index} />)
                  : [0, 1, 2, 3, 4].map((slot) => <PlayingCard key={slot} faceDown />)}
              </View>
              {table?.currentStreet ? (
                <StreetTimeline street={table.currentStreet} />
              ) : (
                <Text style={feltStyles.streetText}>WAITING</Text>
              )}
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

            {/* Bets don't just vanish when a street closes -- they sweep into the pot,
                same physical language as the pot-to-winner push below. */}
            {Object.entries(streetSweepAmounts).map(([playerId, amount]) => {
              const assignment = seatAssignments.find((entry) => entry.player?.id === playerId);
              if (!assignment) return null;
              const { slot } = assignment;
              const bx = slot.x + (0.5 - slot.x) * 0.3;
              const by = slot.y + (0.46 - slot.y) * 0.32;
              return (
                <View
                  key={`sweep-${playerId}-${streetSweepKey}`}
                  pointerEvents="none"
                  style={[feltStyles.betAnchor, { left: bx * tableWidth - 26, top: by * tableHeight - 10 }]}
                >
                  <PotChips
                    amount={amount}
                    pushTo={{ x: (0.5 - bx) * tableWidth, y: (0.46 - by) * tableHeight }}
                    pushKey={streetSweepKey}
                    size={13}
                    columns={2}
                  />
                </View>
              );
            })}

            {seatAssignments.map(({ slot, player, isHero }, index) => (
              <View
                key={index}
                style={[
                  feltStyles.seatAnchor,
                  { left: slot.x * tableWidth - podWidth / 2, top: slot.y * tableHeight - 30 },
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
                  winOdds={isHero ? winOdds : null}
                  isWinner={!!player && player.id === lastWinnerId}
                  turnCountdown={table?.currentTurn === player?.id ? countdown : null}
                  hudStats={player && !isHero ? playerHudStats[player.id] ?? null : null}
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
              <Switch value={preferences.liveDealerEnabled} onValueChange={(value) => setPreferences({ liveDealerEnabled: value })} trackColor={{ false: colors.textFaint, true: colors.gold }} />
            </View>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>Dealer & table sounds</Text>
              <Switch value={preferences.soundEffectsEnabled} onValueChange={(value) => setPreferences({ soundEffectsEnabled: value })} trackColor={{ false: colors.textFaint, true: colors.gold }} />
            </View>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>Ambient effects</Text>
              <Switch value={preferences.ambientEffectsEnabled} onValueChange={(value) => setPreferences({ ambientEffectsEnabled: value })} trackColor={{ false: colors.textFaint, true: colors.gold }} />
            </View>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>Haptic feedback</Text>
              <Switch value={preferences.hapticFeedbackEnabled} onValueChange={(value) => setPreferences({ hapticFeedbackEnabled: value })} trackColor={{ false: colors.textFaint, true: colors.gold }} />
            </View>
            <View style={styles.audioRow}>
              <Text style={styles.audioLabel}>Four-colour deck</Text>
              <Switch
                value={deckMode === 'fourColor'}
                onValueChange={(value) => setDeckMode(value ? 'fourColor' : 'twoColor')}
                trackColor={{ false: colors.textFaint, true: colors.gold }}
              />
            </View>
          </View>
        </View>
      ) : null}

      {/* Only numbers a player would actually use mid-hand — everything here used to
          duplicate what's already on the felt (street, pot, seat count) or was static
          filler (fake tabs that didn't do anything, dealer-quality settings trivia). */}
      <View style={styles.statsPanel}>
        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statLabel}>In hand</Text>
            <Text style={styles.statValue}>{playersInHand}/{totalSeated}</Text>
          </View>
          {heroStackBB !== null ? (
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>Your stack</Text>
              <Text style={styles.statValue}>{heroStackBB.toFixed(1)} BB</Text>
            </View>
          ) : null}
          {potOddsLabel ? (
            <View style={[styles.statTile, styles.statTileHighlight]}>
              <Text style={styles.statLabel}>Pot odds</Text>
              <Text style={styles.statValue}>{potOddsLabel}</Text>
            </View>
          ) : null}
        </View>
        {/* SPR and effective stack describe the hand's overall risk from the first
            action -- a second row rather than crowding them into the row above, which
            is either always-on trivia (seat count) or only relevant at a decision
            (pot odds). */}
        {sprLabel && effectiveStackBBLabel ? (
          <View style={[styles.statsRow, styles.statsRowSecondary]}>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>SPR</Text>
              <Text style={styles.statValue}>{sprLabel}</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={styles.statLabel}>Eff. stack</Text>
              <Text style={styles.statValue}>{effectiveStackBBLabel}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <StartingHandMatrix variant={table?.variant ?? 'nlh'} defaultExpanded />
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
  root: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  message: { color: colors.textMuted, fontSize: fontSize.xl, textAlign: 'center', lineHeight: 22 },
  screen: { flex: 1, backgroundColor: colors.bg },
  // paddingTop is set inline from useSafeAreaInsets() -- a fixed guess here was what
  // let the header sit under the status bar/Dynamic Island on some devices.
  content: { paddingHorizontal: 10, paddingBottom: 16, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8 },
  headerMain: { flex: 1, gap: 2 },
  headerStakes: { color: colors.textMuted, fontSize: fontSize.base, fontWeight: '600' },
  gearButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearText: { color: colors.gold, fontSize: 17 },
  title: { color: colors.text, fontSize: fontSize.display, fontWeight: '900', ...displayFont },
  consoleShelf: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  roomStage: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  // Soft dark radial-ish glow above the felt, standing in for pit lighting without a
  // real gradient dependency (layered flat views, low-opacity center to dark edge).
  roomVignette: {
    position: 'absolute',
    top: -60,
    left: '10%',
    right: '10%',
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(203,178,126,0.05)',
  },
  errorText: { color: colors.danger, fontSize: fontSize.base, lineHeight: 18, textAlign: 'center' },
  tableStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    alignSelf: 'stretch',
    marginHorizontal: 8,
  },
  windowDotRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textFaint },
  liveDotOn: { backgroundColor: colors.mint, shadowColor: colors.mint, shadowOpacity: 0.9, shadowRadius: 6 },
  stripText: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: '800', letterSpacing: 0.8, ...displayFontSemibold },
  stripDivider: { color: colors.textFaint, fontSize: fontSize.base },
  stripTimer: { color: colors.mint, fontSize: fontSize.base, fontWeight: '900', ...numericFont },
  audioPanel: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: 12,
    gap: 10,
  },
  consoleTitle: {
    color: colors.gold,
    fontSize: fontSize.base,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  audioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  audioLabel: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  statsPanel: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    padding: 8,
  },
  statsRow: { flexDirection: 'row', gap: 8 },
  statsRowSecondary: { marginTop: 8 },
  statTile: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
  },
  statTileHighlight: {
    borderColor: colors.gold,
    backgroundColor: 'rgba(203,178,126,0.12)',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '900',
    ...numericFont,
  },
  primaryButton: {
    backgroundColor: colors.gold,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  primaryText: { color: colors.ink, fontSize: fontSize.xxl, fontWeight: '900' },
  feltWrap: { alignItems: 'center', paddingBottom: 14 },
});

const feltStyles = StyleSheet.create({
  felt: {
    position: 'relative',
    backgroundColor: colors.felt,
    borderWidth: 11,
    borderColor: '#15181D',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  // Thin champagne-gold line right at the seam between the rail and the cloth — the
  // single most legible "real table, not an app skin" cue.
  feltPinstripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: 'rgba(203,178,126,0.55)',
  },
  feltRim: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderWidth: 2.5,
    borderColor: 'rgba(8,40,33,0.4)',
  },
  feltGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(242,240,234,0.07)',
  },
  feltInner: {
    position: 'absolute',
    top: '11%',
    left: '7%',
    right: '7%',
    bottom: '11%',
    borderWidth: 3,
    borderColor: 'rgba(8,40,33,0.3)',
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  brandMark: { position: 'absolute', alignItems: 'center', gap: 3 },
  brandText: { color: 'rgba(255,255,255,0.055)', fontSize: 56, fontWeight: '900', letterSpacing: 6 },
  brandSub: { color: 'rgba(255,255,255,0.06)', fontSize: fontSize.md, fontWeight: '900', letterSpacing: 2 },
  dealerStageAnchor: { position: 'absolute', overflow: 'hidden' },
  // left/right (not a fixed width matching the felt's outer dimension) so this spans
  // exactly the felt's true interior regardless of its border thickness -- a fixed
  // width equal to the felt's outer size was overshooting past the border on the right,
  // pulling everything centered inside (pot, chips, board cards) visibly off-center.
  board: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 8 },
  potPill: {
    backgroundColor: 'rgba(39,25,14,0.72)',
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(240,210,120,0.5)',
  },
  potLabel: { color: colors.textMuted, fontSize: fontSize.lg, fontWeight: '800', letterSpacing: 0.5 },
  potText: { color: colors.gold, fontSize: fontSize.lg, fontWeight: '900', ...numericFont },
  boardCards: { flexDirection: 'row', gap: 6 },
  streetText: {
    color: 'rgba(242,240,234,0.6)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  // Four-step progression: preflop/flop/turn/river read at a glance instead of a
  // single street name that needs parsing.
  streetTimeline: { flexDirection: 'row', alignItems: 'center' },
  streetTimelineItem: { flexDirection: 'row', alignItems: 'center' },
  streetDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(242,240,234,0.25)',
  },
  streetDotDone: { backgroundColor: colors.mint },
  streetLine: { width: 14, height: 1.5, backgroundColor: 'rgba(242,240,234,0.25)' },
  streetLineDone: { backgroundColor: colors.mint },
  betAnchor: {
    position: 'absolute',
    width: 52,
    alignItems: 'center',
  },
  seatAnchor: { position: 'absolute', width: 58, alignItems: 'center' },
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
    paddingHorizontal: 4,
    paddingVertical: 0.5,
    marginTop: 1,
  },
  botTagText: { color: '#B9B2E8', fontSize: fontSize.xxs, fontWeight: '900', letterSpacing: 0.6 },
  lastActionPill: {
    backgroundColor: colors.surfaceActive,
    borderColor: colors.goldMuted,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 1,
  },
  lastActionText: { color: colors.gold, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.3 },
  // Only ever rendered on the hero's own pod (see winOdds prop) -- no other seat's client
  // has the hole cards needed to compute this, so there's nothing to leak either way.
  // Overlaps the avatar ring's own reserved space rather than adding a stacked row, the
  // same way trustShield/dealerButton already do on the opposite corner.
  winOddsBadge: {
    position: 'absolute',
    left: -6,
    top: -4,
    minWidth: 20,
    height: 12,
    borderRadius: 6,
    paddingHorizontal: 2,
    backgroundColor: colors.bg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  winOddsBadgeText: { fontSize: fontSize.micro, fontWeight: '900', ...numericFont },
  // Single-hue chip dot, not the pot's photorealistic multi-denomination pile -- that
  // many-coloured art was fighting the app's restrained wine/gold identity at every seat.
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  stackChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  stackAmount: { color: colors.text, fontSize: fontSize.sm, fontWeight: '800', ...numericFont },
  pod: {
    width: 58,
    alignItems: 'center',
    gap: 1,
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  pressedPod: { opacity: 0.6, transform: [{ scale: 0.96 }] },
  // Height matches HoleCards' 'sm' preset (24px) so this row's layout allocation matches
  // what actually renders — it previously under-declared height, which let opponent
  // cards silently bleed into the plate below.
  cardsRow: { flexDirection: 'row', gap: 3, height: 24, marginBottom: -2, zIndex: 2 },
  // Flat nameplate rather than an illustrated armchair — reads as a real table's seat
  // marker instead of a cartoon chair icon. Width is overridden per-seat via podWidth so
  // nine of these fit around the felt without overlapping their neighbors.
  plate: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: 'rgba(10,12,16,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 3,
    paddingBottom: 2,
    paddingHorizontal: 2,
    gap: 1,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  // The hero's own seat: a size and glow no opponent pod gets, so "you" reads as the
  // one seat in command rather than one of nine identical boxes.
  heroPlate: {
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: 'rgba(26,30,36,0.92)',
    shadowColor: colors.gold,
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  // Mint, not gold -- "it's this seat's turn" is a live/action state, the same accent
  // as the timer ring and live-table dot rather than the calmer status gold.
  turnPlate: {
    borderWidth: 1.5,
    borderColor: colors.mint,
    shadowColor: colors.mint,
    shadowOpacity: 0.45,
    shadowRadius: 6,
  },
  emptyPlate: {
    backgroundColor: 'rgba(10,12,16,0.55)',
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  invitingPlate: {
    borderStyle: 'solid',
    borderColor: colors.gold,
    backgroundColor: 'rgba(30,26,14,0.6)',
  },
  // Exact footprint of avatarRing -- the timer ring overlays this same 20x20 box rather
  // than growing it, so the other 8 seats don't reflow when one starts (or stops) acting.
  avatarWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  // Three concentric rings: brass (unified across every seat), the character's own
  // accent (keeps a sliver of persona identity), then the aura fill behind the emoji.
  avatarRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAccentRing: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 11,
    height: 11,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarEmoji: { fontSize: fontSize.xxs, lineHeight: 8 },
  trustShield: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2E2818',
    borderWidth: 1,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustShieldText: { color: '#F3E9D2', fontSize: fontSize.micro, fontWeight: '900' },
  dealerButton: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 12,
    height: 12,
    borderRadius: 6,
    paddingHorizontal: 2,
    backgroundColor: '#F3E9D2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
  },
  dealerButtonText: { color: colors.ink, fontSize: fontSize.xxs, fontWeight: '900', lineHeight: 9 },
  pulseRing: { position: 'absolute', top: 8, left: 1, right: 1, bottom: 16, borderRadius: 36, borderWidth: 2, borderColor: colors.gold },
  nameTag: {
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 0.5,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    marginTop: 1,
    maxWidth: '100%',
  },
  name: { color: colors.text, fontSize: fontSize.xs, fontWeight: '800', maxWidth: '100%', textAlign: 'center' },
  status: { color: 'rgba(242,240,234,0.55)', fontSize: fontSize.xxs, fontWeight: '800', marginTop: 0.5 },
  statusActive: { color: colors.mint },
  // VPIP/PFR opponent read, e.g. "24/12" -- data-viz violet keeps it visually distinct
  // from the wine/gold identity used for game-state text like status and last action.
  hudLabel: { color: colors.dataViolet, fontSize: fontSize.xxs, fontWeight: '800', marginTop: 0.5 },
  emptyAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.goldDim,
    borderStyle: 'dashed',
  },
  emptyPlus: { color: colors.goldDim, fontSize: fontSize.lg, fontWeight: '900' },
  emptyLabel: { color: colors.textFaint, fontSize: fontSize.xxs, fontWeight: '800', textAlign: 'center' },
  invitingAvatar: { borderColor: colors.gold, borderStyle: 'solid' },
  invitingPlus: { color: colors.gold },
  invitingLabel: { color: colors.gold, fontWeight: '900' },
});
