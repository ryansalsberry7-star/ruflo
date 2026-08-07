import { Circle, Line, Polygon, Svg, Text as SvgText } from 'react-native-svg';
import type { HeroCardStats } from '../lib/heroCard';

interface OpponentRadarProps {
  stats: HeroCardStats;
  color: string;
  size?: number;
}

const AXES: Array<{ key: keyof HeroCardStats; label: string }> = [
  { key: 'aggression', label: '♠' },
  { key: 'bluff', label: '♥' },
  { key: 'discipline', label: '♣' },
  { key: 'reads', label: '♦' },
];

const RINGS = [0.25, 0.5, 0.75, 1];

function pointFor(index: number, fraction: number, center: number, maxRadius: number): { x: number; y: number } {
  // Four axes, starting straight up and going clockwise -- matches the Aggression/Bluff/
  // Discipline/Reads suit order already used by HeroCardDetail's stat rows, so the shape
  // reads left-to-right the same way the numbers below it do.
  const angle = -Math.PI / 2 + index * (Math.PI / 2);
  const radius = fraction * maxRadius;
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

/** A 4-axis stat shape for a player's Hero Card -- the same Aggression/Bluff/Discipline/
 *  Reads block HeroCardDetail already shows as bars, drawn here as a shape instead so an
 *  opponent's overall play style reads at a glance rather than four numbers to compare
 *  one at a time. */
export function OpponentRadar({ stats, color, size = 140 }: OpponentRadarProps) {
  const center = size / 2;
  const maxRadius = size / 2 - 18;

  const statPoints = AXES.map((axis, index) => pointFor(index, stats[axis.key] / 100, center, maxRadius));
  const polygonPoints = statPoints.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <Svg width={size} height={size}>
      {RINGS.map((fraction) => {
        const ringPoints = AXES.map((_, index) => pointFor(index, fraction, center, maxRadius));
        return (
          <Polygon
            key={fraction}
            points={ringPoints.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={1}
          />
        );
      })}
      {AXES.map((_, index) => {
        const edge = pointFor(index, 1, center, maxRadius);
        return <Line key={index} x1={center} y1={center} x2={edge.x} y2={edge.y} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />;
      })}
      <Polygon points={polygonPoints} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={2} />
      {statPoints.map((point, index) => (
        <Circle key={index} cx={point.x} cy={point.y} r={3} fill={color} />
      ))}
      {AXES.map((axis, index) => {
        const labelPoint = pointFor(index, 1.18, center, maxRadius);
        return (
          <SvgText
            key={axis.key}
            x={labelPoint.x}
            y={labelPoint.y + 4}
            fontSize={13}
            fill="rgba(255,255,255,0.55)"
            textAnchor="middle"
          >
            {axis.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}
