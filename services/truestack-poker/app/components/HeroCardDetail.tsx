import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlayerCharacter } from '../lib/playerIdentity';
import type { RarityInfo, HeroCardStats } from '../lib/heroCard';
import { colors, displayFont, fontSize, numericFont } from '../lib/theme';
import { OpponentRadar } from './OpponentRadar';
import { RarityFrame } from './RarityFrame';

interface HeroCardDetailProps {
  visible: boolean;
  onClose: () => void;
  character: PlayerCharacter;
  displayName: string;
  rarity: RarityInfo;
  level: number;
  stats: HeroCardStats;
  winStreak: number;
  isBot?: boolean;
}

const STAT_ROWS: Array<{ key: keyof HeroCardStats; label: string; suit: string }> = [
  { key: 'aggression', label: 'Aggression', suit: '♠' },
  { key: 'bluff', label: 'Bluff', suit: '♥' },
  { key: 'discipline', label: 'Discipline', suit: '♣' },
  { key: 'reads', label: 'Reads', suit: '♦' },
];

/** The full "poker license card" -- tapping a seat's compact card frame opens this.
 *  Too much detail (four stats, level, rarity, win streak) to fit in the inline seat
 *  pod without reintroducing the crowding this table has fought hard to avoid, so it
 *  lives in a modal instead of the always-visible seat itself. */
export function HeroCardDetail({ visible, onClose, character, displayName, rarity, level, stats, winStreak, isBot }: HeroCardDetailProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { borderColor: rarity.color, shadowColor: rarity.glow }]} onPress={() => {}}>
          <RarityFrame rarity={rarity} radius={20} />
          <Text style={[styles.rarityEyebrow, { color: rarity.color }]}>{rarity.label.toUpperCase()} RANK</Text>

          <View style={[styles.illustration, { backgroundColor: character.aura, borderColor: rarity.color }]}>
            <Text style={styles.illustrationEmoji}>{character.emoji}</Text>
          </View>

          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.title}>{character.title}</Text>
          {isBot ? <Text style={styles.botNote}>Simulated opponent</Text> : null}
          <Text style={styles.description}>{character.description}</Text>

          <View style={styles.radarWrap}>
            <OpponentRadar stats={stats} color={rarity.color} size={132} />
          </View>

          <View style={styles.statBlock}>
            {STAT_ROWS.map((row) => {
              const value = stats[row.key];
              return (
                <View key={row.key} style={styles.statRow}>
                  <Text style={styles.statSuit}>{row.suit}</Text>
                  <Text style={styles.statLabel}>{row.label}</Text>
                  <View style={styles.statBarTrack}>
                    <View style={[styles.statBarFill, { width: `${value}%`, backgroundColor: rarity.color }]} />
                  </View>
                  <Text style={[styles.statValue, numericFont]}>{value}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.footerRow}>
            <View style={styles.footerStat}>
              <Text style={styles.footerLabel}>Level</Text>
              <Text style={[styles.footerValue, numericFont]}>{level}</Text>
            </View>
            <View style={styles.footerStat}>
              <Text style={styles.footerLabel}>Win Streak</Text>
              <Text style={[styles.footerValue, numericFont, winStreak > 0 && { color: colors.mint }]}>{winStreak}</Text>
            </View>
          </View>

          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={10}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,6,8,0.78)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: colors.surface,
    padding: 20,
    alignItems: 'center',
    gap: 4,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  rarityEyebrow: { fontSize: fontSize.sm, fontWeight: '900', letterSpacing: 2 },
  illustration: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  illustrationEmoji: { fontSize: 42 },
  name: { color: colors.text, fontSize: fontSize.display, fontWeight: '900', ...displayFont },
  title: { color: colors.textMuted, fontSize: fontSize.lg, fontWeight: '700', marginTop: -2 },
  botNote: { color: colors.textFaint, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1, marginTop: 4, textTransform: 'uppercase' },
  description: { color: colors.textMuted, fontSize: fontSize.base, textAlign: 'center', lineHeight: 18, marginTop: 8, marginBottom: 6 },
  radarWrap: { alignItems: 'center', marginTop: 4 },
  statBlock: { width: '100%', gap: 8, marginTop: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statSuit: { color: colors.textFaint, fontSize: fontSize.base, width: 14 },
  statLabel: { color: colors.textMuted, fontSize: fontSize.base, fontWeight: '700', width: 78 },
  statBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.borderSubtle, overflow: 'hidden' },
  statBarFill: { height: 6, borderRadius: 3 },
  statValue: { color: colors.text, fontSize: fontSize.base, fontWeight: '800', width: 28, textAlign: 'right' },
  footerRow: { flexDirection: 'row', gap: 24, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border, width: '100%', justifyContent: 'center' },
  footerStat: { alignItems: 'center', gap: 2 },
  footerLabel: { color: colors.textFaint, fontSize: fontSize.sm, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  footerValue: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '900' },
  closeButton: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 999, backgroundColor: colors.surfaceRaised },
  closeButtonText: { color: colors.textMuted, fontSize: fontSize.base, fontWeight: '800' },
});
