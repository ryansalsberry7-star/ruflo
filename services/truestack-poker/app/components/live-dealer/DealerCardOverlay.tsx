import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { DealerSceneCue, DealerSeatTarget, DealerRenderProfile } from './types';

interface OverlaySprite {
  id: string;
  kind: 'card' | 'chip' | 'button';
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  rotate: Animated.Value;
}

interface DealerCardOverlayProps {
  cue: DealerSceneCue;
  seatTargets: DealerSeatTarget[];
  renderProfile: DealerRenderProfile;
  tableWidth: number;
  tableHeight: number;
}

function boardTargets(tableWidth: number, tableHeight: number, count: number): Array<{ x: number; y: number }> {
  const cardWidth = 34;
  const gap = 12;
  const totalWidth = count * cardWidth + Math.max(0, count - 1) * gap;
  const startX = tableWidth * 0.5 - totalWidth / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: startX + index * (cardWidth + gap),
    y: tableHeight * 0.47,
  }));
}

export function DealerCardOverlay({ cue, seatTargets, renderProfile, tableWidth, tableHeight }: DealerCardOverlayProps) {
  const [sprites, setSprites] = useState<OverlaySprite[]>([]);

  useEffect(() => {
    const source = { x: tableWidth * 0.5 - 12, y: tableHeight * 0.2 };
    const nextSprites: OverlaySprite[] = [];
    const animations: Animated.CompositeAnimation[] = [];

    function buildSprite(kind: OverlaySprite['kind'], targetX: number, targetY: number, index: number): void {
      const sprite: OverlaySprite = {
        id: `${cue.id}-${kind}-${index}`,
        kind,
        x: new Animated.Value(source.x),
        y: new Animated.Value(source.y),
        opacity: new Animated.Value(0),
        rotate: new Animated.Value(kind === 'chip' ? 0.2 : 0.7),
      };

      nextSprites.push(sprite);
      animations.push(
        Animated.parallel([
          Animated.timing(sprite.opacity, {
            toValue: 1,
            duration: 140,
            delay: index * 90,
            useNativeDriver: false,
          }),
          Animated.timing(sprite.x, {
            toValue: targetX,
            duration: 540,
            delay: index * 90,
            useNativeDriver: false,
          }),
          Animated.timing(sprite.y, {
            toValue: targetY,
            duration: 540,
            delay: index * 90,
            useNativeDriver: false,
          }),
          Animated.timing(sprite.rotate, {
            toValue: 0,
            duration: 540,
            delay: index * 90,
            useNativeDriver: false,
          }),
          Animated.sequence([
            Animated.delay(720 + index * 60),
            Animated.timing(sprite.opacity, {
              toValue: 0,
              duration: 220,
              useNativeDriver: false,
            }),
          ]),
        ])
      );
    }

    if (cue.animation === 'deal-hole') {
      seatTargets.slice(0, renderProfile.holeCardLimit).forEach((target, index) => {
        buildSprite('card', target.x - 10, target.y - 26, index);
      });
    }

    if (cue.animation === 'deal-flop') {
      boardTargets(tableWidth, tableHeight, 3).forEach((target, index) => {
        buildSprite('card', target.x, target.y, index);
      });
    }

    if (cue.animation === 'deal-turn') {
      const target = boardTargets(tableWidth, tableHeight, 4)[3];
      buildSprite('card', target.x, target.y, 0);
    }

    if (cue.animation === 'deal-river') {
      const target = boardTargets(tableWidth, tableHeight, 5)[4];
      buildSprite('card', target.x, target.y, 0);
    }

    if (cue.animation === 'collect-chips' || cue.animation === 'push-pot') {
      [0, 1, 2, 3].forEach((index) => {
        buildSprite('chip', tableWidth * 0.44 + index * 10, tableHeight * 0.4 + (index % 2) * 8, index);
      });
    }

    if (cue.animation === 'show-button') {
      buildSprite('button', tableWidth * 0.52, tableHeight * 0.31, 0);
    }

    setSprites(nextSprites);
    animations.forEach((animation) => animation.start());

    const cleanupTimer = setTimeout(() => setSprites([]), Math.max(1200, cue.durationMs + 500));
    return () => clearTimeout(cleanupTimer);
  }, [cue, renderProfile, seatTargets, tableHeight, tableWidth]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {sprites.map((sprite) => (
        <Animated.View
          key={sprite.id}
          style={[
            styles.sprite,
            sprite.kind === 'card' ? styles.card : sprite.kind === 'chip' ? styles.chip : styles.button,
            {
              left: sprite.x,
              top: sprite.y,
              opacity: sprite.opacity,
              transform: [
                {
                  rotate: sprite.rotate.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '16deg'],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sprite: {
    position: 'absolute',
  },
  card: {
    width: 24,
    height: 34,
    borderRadius: 5,
    backgroundColor: '#FFF7EE',
    borderWidth: 1,
    borderColor: '#D6C5AE',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  chip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E2B75F',
    borderWidth: 2,
    borderColor: '#F7E2A2',
  },
  button: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F1F2F5',
    borderWidth: 1,
    borderColor: '#1A1C22',
  },
});
