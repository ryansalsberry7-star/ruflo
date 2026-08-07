import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { RarityInfo } from '../lib/heroCard';

interface RarityFrameProps {
  rarity: RarityInfo;
  /** Corner-radius of the surface this frame decorates -- must match the parent's own
   *  borderRadius or the corner ticks land in the wrong place. */
  radius?: number;
}

// Tiers below this get a plain rarity-colored border (already applied by the caller) and
// nothing else -- corner ticks and shimmer are a reward for climbing, not baseline noise
// on every seat.
const ORNAMENT_TIERS = new Set(['emerald', 'ruby', 'obsidian', 'diamond', 'aurora']);
const SHIMMER_TIERS = new Set(['diamond', 'aurora']);

/**
 * Decorative overlay for a rarity-tinted surface (seat plate, Hero Card modal). Drop it as
 * the FIRST child of an already-bordered, already-positioned parent with matching
 * `radius` -- it only adds corner ticks (mid rarities) and a shimmer sweep (top rarities)
 * on top of the parent's own borderColor, so there is exactly one place that owns the
 * base border rather than three copies of the same rarity-color logic.
 */
export function RarityFrame({ rarity, radius = 16 }: RarityFrameProps) {
  const shimmer = useRef(new Animated.Value(0)).current;
  const showShimmer = SHIMMER_TIERS.has(rarity.tier);

  useEffect(() => {
    if (!showShimmer) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(shimmer, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [showShimmer, shimmer]);

  if (!ORNAMENT_TIERS.has(rarity.tier)) return null;

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-120, 120] });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <View style={[styles.corner, styles.cornerTL, { borderColor: rarity.glow }]} />
      <View style={[styles.corner, styles.cornerTR, { borderColor: rarity.glow }]} />
      <View style={[styles.corner, styles.cornerBL, { borderColor: rarity.glow }]} />
      <View style={[styles.corner, styles.cornerBR, { borderColor: rarity.glow }]} />
      {showShimmer ? (
        <Animated.View
          style={[
            styles.shimmer,
            { backgroundColor: rarity.glow, transform: [{ translateX }, { rotate: '20deg' }] },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', width: 10, height: 10, opacity: 0.85 },
  cornerTL: { top: 3, left: 3, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 3, right: 3, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 3, left: 3, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 3, right: 3, borderBottomWidth: 2, borderRightWidth: 2 },
  shimmer: { position: 'absolute', top: -40, bottom: -40, width: 18, opacity: 0.16 },
});
