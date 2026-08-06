import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

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

export function ChipPile({ amount, size = 16, showLabel = true, columns = 1 }: ChipPileProps) {
  if (amount <= 0) return null;

  const chips = chipBreakdown(amount);
  const perColumn = Math.ceil(chips.length / columns);
  const stacks: Denomination[][] = [];
  for (let index = 0; index < chips.length; index += perColumn) {
    stacks.push(chips.slice(index, index + perColumn));
  }

  const lift = Math.max(2, Math.round(size * 0.22));

  return (
    <View style={styles.pileRow}>
      <View style={styles.stacksRow}>
        {stacks.map((stack, stackIndex) => (
          <View
            key={stackIndex}
            style={{ width: size, height: size * 0.45 + (stack.length - 1) * lift, justifyContent: 'flex-end' }}
          >
            {stack.map((chip, chipIndex) => (
              <View
                key={chipIndex}
                style={[
                  styles.chip,
                  {
                    bottom: chipIndex * lift,
                    width: size,
                    height: Math.max(5, size * 0.45),
                    borderRadius: size,
                    backgroundColor: chip.body,
                    borderColor: chip.edge,
                  },
                ]}
              >
                <View style={[styles.chipStripe, { backgroundColor: chip.accent }]} />
              </View>
            ))}
          </View>
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

export function PotChips({ amount, pushTo, pushKey = 0, size = 20, columns = 3, showLabel = false }: PotChipsProps) {
  const move = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!pushTo) {
      move.setValue({ x: 0, y: 0 });
      fade.setValue(1);
      return;
    }

    move.setValue({ x: 0, y: 0 });
    fade.setValue(1);
    Animated.parallel([
      Animated.timing(move, { toValue: pushTo, duration: 620, useNativeDriver: false }),
      Animated.timing(fade, { toValue: 0, duration: 620, delay: 160, useNativeDriver: false }),
    ]).start();
  }, [pushTo, pushKey, move, fade]);

  if (amount <= 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{ opacity: fade, transform: [{ translateX: move.x }, { translateY: move.y }] }}
    >
      <ChipPile amount={amount} size={size} columns={columns} showLabel={showLabel} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pileRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  stacksRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  chip: {
    position: 'absolute',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipStripe: { width: '52%', height: 1.5, borderRadius: 1, opacity: 0.9 },
  amount: {
    color: '#FFF4E7',
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  betWrap: { alignItems: 'center' },
});
