import { Circle, Svg } from 'react-native-svg';

interface CelticKnotProps {
  size?: number;
  color?: string;
  opacity?: number;
}

/**
 * A trinity-knot emblem -- three interlocking rings arranged around a shared center,
 * the simplest recognizably-Celtic motif to render as pure vector shapes (no image
 * asset, no font glyph dependency). Used sparingly as a brand mark on the app's
 * first-impression screens (splash, onboarding) and as a small accent elsewhere,
 * rather than a redesign of every screen's chrome.
 */
export function CelticKnot({ size = 32, color = '#2FBF71', opacity = 0.9 }: CelticKnotProps) {
  const center = size / 2;
  const ringRadius = size * 0.27;
  const offset = size * 0.16;
  const strokeWidth = Math.max(1.4, size * 0.045);

  const points = [
    { x: center, y: center - offset },
    { x: center - offset * 0.87, y: center + offset * 0.5 },
    { x: center + offset * 0.87, y: center + offset * 0.5 },
  ];

  return (
    <Svg width={size} height={size}>
      {points.map((point, index) => (
        <Circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={ringRadius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeOpacity={opacity}
        />
      ))}
    </Svg>
  );
}
