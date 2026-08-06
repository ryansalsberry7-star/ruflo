import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface TimerRingProps {
  /** Outer diameter of the ring, including its stroke. */
  size: number;
  strokeWidth?: number;
  /** 0-1, where 1 is full time remaining and 0 is expired. */
  progress: number;
  color: string;
  trackColor?: string;
}

/**
 * Circular countdown that burns down around a seat's avatar during its turn --
 * the "timer ring" cue from the cockpit redesign. Built on react-native-svg rather
 * than a hand-rolled semicircle mask: at the ~20-26px an avatar ring renders at, a
 * true stroke-dashoffset arc stays crisp where a rotated-half-circle hack would show
 * seams.
 */
export function TimerRing({ size, strokeWidth = 2, progress, color, trackColor = 'rgba(255,255,255,0.16)' }: TimerRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const anim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: progress, duration: 260, useNativeDriver: false }).start();
  }, [progress, anim]);

  const strokeDashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });

  return (
    <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation={-90}
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}
