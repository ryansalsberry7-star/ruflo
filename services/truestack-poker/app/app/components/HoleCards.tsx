import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, suitColors, type DeckColorMode } from '../lib/theme';

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

/** Card ids arrive as rank + suit initial, e.g. "AS", "TH". */
function parseCard(id: string): { rank: string; suit: string } | null {
  if (!id || id.length < 2) return null;
  const suit = id.slice(-1).toLowerCase();
  const rank = id.slice(0, -1).toUpperCase();
  if (!SUIT_SYMBOL[suit]) return null;
  return { rank: rank === 'T' ? '10' : rank, suit };
}

interface CardFaceProps {
  id: string;
  deckMode: DeckColorMode;
  size?: 'sm' | 'md' | 'lg';
}

export function CardFace({ id, deckMode, size = 'md' }: CardFaceProps) {
  const parsed = parseCard(id);
  const dims = size === 'lg' ? cardDims.lg : size === 'sm' ? cardDims.sm : cardDims.md;

  if (!parsed) {
    return <View style={[styles.card, dims, styles.cardBack]} />;
  }

  const color = suitColors[deckMode][parsed.suit as keyof (typeof suitColors)['fourColor']];

  return (
    <View style={[styles.card, dims]}>
      <Text style={[styles.rank, { color, fontSize: dims.height * 0.32 }]}>{parsed.rank}</Text>
      <Text style={[styles.suit, { color, fontSize: dims.height * 0.3 }]}>{SUIT_SYMBOL[parsed.suit]}</Text>
    </View>
  );
}

interface HoleCardsProps {
  cards: string[];
  deckMode: DeckColorMode;
  /** Rendered face-down when the hand is not the viewer's own. */
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** How many backs to show when face-down: 2 for Hold'em, 4 for Omaha. */
  cardCount?: number;
}

/** Fan the cards slightly. Two cards splay; four sit nearly flat so they still fit a pod. */
function tiltFor(index: number, total: number): { transform: [{ rotate: string }] } {
  if (total <= 1) return { transform: [{ rotate: '0deg' }] };
  const spread = total > 2 ? 4 : 6;
  const step = (spread * 2) / (total - 1);
  return { transform: [{ rotate: `${-spread + index * step}deg` }] };
}

export function HoleCards({ cards, deckMode, faceDown = false, size = 'md', cardCount = 2 }: HoleCardsProps) {
  const dims = size === 'lg' ? cardDims.lg : size === 'sm' ? cardDims.sm : cardDims.md;

  if (faceDown || cards.length === 0) {
    const backs = Math.max(1, cardCount);
    return (
      <View style={styles.row}>
        {Array.from({ length: backs }, (_, index) => (
          <View key={index} style={[styles.card, dims, styles.cardBack, tiltFor(index, backs)]} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {cards.map((card, index) => (
        <View key={`${card}-${index}`} style={tiltFor(index, cards.length)}>
          <CardFace id={card} deckMode={deckMode} size={size} />
        </View>
      ))}
    </View>
  );
}

const cardDims = {
  sm: { width: 22, height: 32 },
  md: { width: 30, height: 43 },
  lg: { width: 42, height: 60 },
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  card: {
    backgroundColor: '#1A1216',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#4A3A40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBack: { backgroundColor: '#5B2733', borderColor: '#8A4453' },
  rank: { fontWeight: '900', lineHeight: undefined },
  suit: { fontWeight: '700', marginTop: -2 },
  tiltLeft: { transform: [{ rotate: '-6deg' }] },
  tiltRight: { transform: [{ rotate: '6deg' }] },
});

export { parseCard };
