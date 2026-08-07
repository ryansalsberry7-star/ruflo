import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

/**
 * Casino chip rendering.
 *
 * Amounts are broken into real denominations rather than drawn as a fixed pile, so the
 * size and colour of a stack carries information: a $100 bet looks different from a $5
 * one at a glance, the same way it does at a live table.
 */

interface Denomination {
  value: number;
  body: string;
  edge: string;
  accent: string;
}

// Standard casino colours, largest first so the greedy break-down below works.
const DENOMINATIONS: Denomination[] = [
  { value: 500, body: '#6B3FA0', edge: '#4A2A70', accent: '#D9C7EE' },
  { value: 100, body: '#1E1E24', edge: '#000000', accent: '#C9C9D4' },
  { value: 25, body: '#1F7A44', edge: '#12522C', accent: '#B6E3C8' },
  { value: 5, body: '#B03B3B', edge: '#7A2626', accent: '#F0C0C0' },
  { value: 1, body: '#E8E4DC', edge: '#A9A296', accent: '#7A736A' },
  { value: 0.25, body: '#3A6EA5', edge: '#26496E', accent: '#BBD6EE' },
  { value: 0.05, body: '#D9A62E', edge: '#4A2E12', accent: '#E8578F' },
];

/**
 * Greedy break-down into chips, capped so a large pot does not render hundreds of views.
 * Once the cap is hit the remainder rides on the largest chip already shown.
 */
export function chipBreakdown(amount: number, maxChips = 12): Denomination[] {
  const chips: Denomination[] = [];
  let remaining = Math.round(amount * 100) / 100;

  for (const denomination of DENOMINATIONS) {
    while (remaining >= denomination.value - 1e-9 && chips.length < maxChips) {
      chips.push(denomination);
      remaining = Math.round((remaining - denomination.value) * 100) / 100;
    }
    if (chips.length >= maxChips) break;
  }

  if (chips.length === 0 && amount > 0) chips.push(DENOMINATIONS[DENOMINATIONS.length - 1]);
  return chips;
}

function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? `$${rounded}` : `$${rounded.toFixed(2)}`;
}

interface ChipPileProps {
  amount: number;
  /** Chip diameter. Bet stacks are small; the pot is larger. */
  size?: number;
  /** Show the amount beside the chips. */
  showLabel?: boolean;
  /** Spread into multiple short columns instead of one tall one. */
  columns?: number;
}

function buildStacks(amount: number, columns: number): Denomination[][] {
  const chips = chipBreakdown(amount);
  const perColumn = Math.ceil(chips.length / columns);
  const stacks: Denomination[][] = [];
  for (let index = 0; index < chips.length; index += perColumn) {
    stacks.push(chips.slice(index, index + perColumn));
  }
  return stacks;
}

interface ChipStackProps {
  stack: Denomination[];
  size: number;
}

/** One column of a chip pile -- the top chip is a full disc, everything beneath shows
 *  only its rim (the thin colored band a real stacked chip's edge shows), rather than a
 *  full second disc, which is what turned a tall stack into a flower of overlapping
 *  ellipses instead of a token stack. Shared by the static pile and the animated sweep
 *  below so there is exactly one place that draws a chip stack. */
function ChipStack({ stack, size }: ChipStackProps) {
  const edgeHeight = Math.max(4, Math.round(size * 0.24));
  return (
    <View style={{ width: size, height: size + (stack.length - 1) * edgeHeight, justifyContent: 'flex-end' }}>
      {stack.map((chip, chipIndex) => {
        const isTop = chipIndex === stack.length - 1;
        if (isTop) {
          return (
            <View
              key={chipIndex}
              style={[
                styles.chipDisc,
                {
                  bottom: chipIndex * edgeHeight,
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderWidth: Math.max(1.5, size * 0.12),
                  backgroundColor: chip.body,
                  borderColor: chip.accent,
                },
              ]}
            >
              <View
                style={[
                  styles.chipDiscCenter,
                  { width: size * 0.42, height: size * 0.42, borderRadius: (size * 0.42) / 2, backgroundColor: chip.edge },
                ]}
              />
            </View>
          );
        }
        return (
          <View
            key={chipIndex}
            style={[
              styles.chipEdge,
              {
                bottom: chipIndex * edgeHeight,
                width: size,
                height: edgeHeight,
                borderRadius: edgeHeight / 2,
                backgroundColor: chip.edge,
              },
            ]}
          >
            <View style={[styles.chipEdgeMark, { backgroundColor: chip.accent }]} />
          </View>
        );
      })}
    </View>
  );
}

export function ChipPile({ amount, size = 16, showLabel = true, columns = 1 }: ChipPileProps) {
  if (amount <= 0) return null;

  const stacks = buildStacks(amount, columns);

  return (
    <View style={styles.pileRow}>
      <View style={styles.stacksRow}>
        {stacks.map((stack, stackIndex) => (
          <ChipStack key={stackIndex} stack={stack} size={size} />
        ))}
      </View>
      {showLabel ? <Text style={[styles.amount, { fontSize: Math.max(9, size * 0.6) }]}>{formatAmount(amount)}</Text> : null}
    </View>
  );
}

interface BetChipsProps {
  amount: number;
}

/** Chips a player has pushed forward this street, shown in front of their seat. */
export function BetChips({ amount }: BetChipsProps) {
  if (amount <= 0) return null;
  return (
    <View style={styles.betWrap}>
      <ChipPile amount={amount} size={13} columns={2} />
    </View>
  );
}

interface PotChipsProps {
  amount: number;
  /**
   * Seat offset to sweep toward when a hand is won, in pixels from the pot. The pile
   * animates to the winner and fades, standing in for the dealer pushing the pot.
   */
  pushTo?: { x: number; y: number } | null;
  /** Bumped each settlement so a repeat win at the same seat still replays the push. */
  pushKey?: number;
  /**
   * Chip diameter and column count -- defaults match the pot itself. A seat's bet
   * sweeping into the pot at street-end reuses this same component at a smaller size
   * rather than duplicating the animation.
   */
  size?: number;
  columns?: number;
  showLabel?: boolean;
}

interface AnimatedChipStackProps {
  stack: Denomination[];
  size: number;
  pushTo?: { x: number; y: number } | null;
  pushKey: number;
  /** Stagger so stacks leave in sequence -- a dealer scoops a handful at a time, not
   *  the whole pot as one rigid block. */
  delay: number;
  /** Per-stack horizontal jitter so the sweep scatters into the winner's pile rather
   *  than every column tracing the identical path on top of each other. */
  scatter: number;
}

function AnimatedChipStack({ stack, size, pushTo, pushKey, delay, scatter }: AnimatedChipStackProps) {
  const move = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const fade = useRef(new Animated.Value(1)).current;
  // Drives a small upward bump layered on top of the straight-line sweep below --
  // chips arcing toward the winner reads as a toss, a linear slide reads as a drag.
  const arc = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pushTo) {
      move.setValue({ x: 0, y: 0 });
      fade.setValue(1);
      arc.setValue(0);
      return;
    }

    move.setValue({ x: 0, y: 0 });
    fade.setValue(1);
    arc.setValue(0);
    const target = { x: pushTo.x + scatter, y: pushTo.y };
    Animated.parallel([
      Animated.timing(move, { toValue: target, duration: 560, delay, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(arc, { toValue: 1, duration: 560, delay, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(fade, { toValue: 0, duration: 420, delay: delay + 260, useNativeDriver: false }),
    ]).start();
  }, [pushTo, pushKey, delay, scatter, move, fade, arc]);

  const arcLift = arc.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -16 - Math.min(10, Math.abs(scatter) * 0.4), 0] });

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateX: move.x }, { translateY: move.y }, { translateY: arcLift }] }}>
      <ChipStack stack={stack} size={size} />
    </Animated.View>
  );
}

export function PotChips({ amount, pushTo, pushKey = 0, size = 20, columns = 3, showLabel = false }: PotChipsProps) {
  if (amount <= 0) return null;

  const stacks = buildStacks(amount, columns);

  return (
    <View style={styles.pileRow} pointerEvents="none">
      <View style={styles.stacksRow}>
        {stacks.map((stack, stackIndex) => (
          <AnimatedChipStack
            key={stackIndex}
            stack={stack}
            size={size}
            pushTo={pushTo}
            pushKey={pushKey}
            delay={stackIndex * 45}
            scatter={(stackIndex % 2 === 0 ? 1 : -1) * (4 + (stackIndex % 3) * 3)}
          />
        ))}
      </View>
      {showLabel ? <Text style={[styles.amount, { fontSize: Math.max(9, size * 0.6) }]}>{formatAmount(amount)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pileRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  stacksRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  // The top chip in a stack: a full disc with a dashed accent rim (the classic casino
  // chip edge-spot pattern) and a smaller center dot in the edge color for depth.
  chipDisc: {
    position: 'absolute',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 1.5,
  },
  chipDiscCenter: { opacity: 0.9 },
  // Everything below the top chip: just the rim a stacked chip shows from the side.
  chipEdge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipEdgeMark: { width: '46%', height: 1.5, borderRadius: 1, opacity: 0.9 },
  amount: {
    color: '#FFF4E7',
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  betWrap: { alignItems: 'center' },
});
