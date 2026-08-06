import { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import type { GameVariant } from '../lib/betting';
import {
  NLH_HANDS,
  NLH_HANDS_BY_ID,
  NLH_POSITIONS,
  PLO_CATEGORIES,
  POSITION_LABELS,
  RANKS,
  ploStrategyFor,
  ploStrengthColor,
  strategyBlurb,
  strategyFor,
  strengthColor,
  type ActionTier,
  type HandStrategy,
  type NlhHand,
  type NlhPosition,
} from '../lib/handRanges';

interface StartingHandMatrixProps {
  variant: GameVariant;
  defaultExpanded?: boolean;
}

const ACTION_CODE: Record<ActionTier, string> = { raise: 'R', mixed: 'M', occasional: '?', fold: '' };

/**
 * Collapsed by default (unless `defaultExpanded`), and the entire grid/category list (data
 * lookups, cell components) only mounts once expanded, so a player who never opens this pays no
 * rendering or computation cost for it. Memoized on `variant` alone -- table.tsx re-renders on
 * every websocket tick, but this component has no reason to follow along.
 */
function StartingHandMatrixImpl({ variant, defaultExpanded = false }: StartingHandMatrixProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [position, setPosition] = useState<NlhPosition>('CO');
  const [showAction, setShowAction] = useState(true);
  const [showFrequency, setShowFrequency] = useState(false);
  const [showEV, setShowEV] = useState(false);
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  if (!expanded) {
    return (
      <Pressable style={styles.collapsedBar} onPress={() => setExpanded(true)}>
        <Text style={styles.collapsedTitle}>Starting Hand Matrix</Text>
        <Text style={styles.chevron}>{'›'}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={() => setExpanded(false)}>
        <Text style={styles.headerTitle}>Starting Hand Matrix</Text>
        <Text style={[styles.chevron, styles.chevronDown]}>{'›'}</Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        Approximate strategy guide from published opening ranges and the Chen hand-strength
        formula — not solved-game (GTO) output.
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        <View style={styles.positionRow}>
          {NLH_POSITIONS.map((pos) => (
            <Pressable
              key={pos}
              onPress={() => setPosition(pos)}
              style={[styles.positionChip, position === pos && styles.positionChipActive]}
            >
              <Text style={[styles.positionChipText, position === pos && styles.positionChipTextActive]}>{pos}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.positionCaption}>{POSITION_LABELS[position]} — opening range if first to act</Text>

      <View style={styles.toggleRow}>
        <ToggleChip label="Action" active={showAction} onPress={() => setShowAction((value) => !value)} />
        <ToggleChip label="Frequency" active={showFrequency} onPress={() => setShowFrequency((value) => !value)} />
        <ToggleChip label="EV" active={showEV} onPress={() => setShowEV((value) => !value)} />
      </View>
      <Text style={styles.toggleCaption}>
        Grid shows one value at a time (Action, then Frequency, then EV) — tap any hand for the full breakdown.
      </Text>

      {variant === 'plo' ? (
        <PloCategoryList
          position={position}
          showAction={showAction}
          showFrequency={showFrequency}
          showEV={showEV}
          selectedId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />
      ) : (
        <NlhGrid
          position={position}
          showAction={showAction}
          showFrequency={showFrequency}
          showEV={showEV}
          selectedId={selectedHandId}
          onSelect={setSelectedHandId}
        />
      )}
    </View>
  );
}

export const StartingHandMatrix = memo(StartingHandMatrixImpl);

function ToggleChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.toggleChip, active && styles.toggleChipActive]}>
      <Text style={[styles.toggleChipText, active && styles.toggleChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function cellOverlayText(strategy: HandStrategy, showAction: boolean, showFrequency: boolean, showEV: boolean): string {
  if (showAction) return ACTION_CODE[strategy.action];
  if (showFrequency) return strategy.action === 'fold' ? '' : `${strategy.frequency}`;
  if (showEV) return strategy.action === 'fold' ? '' : `${strategy.ev}`;
  return '';
}

interface NlhGridProps {
  position: NlhPosition;
  showAction: boolean;
  showFrequency: boolean;
  showEV: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function NlhGrid({ position, showAction, showFrequency, showEV, selectedId, onSelect }: NlhGridProps) {
  const rows = useMemo(() => {
    const grouped: NlhHand[][] = Array.from({ length: RANKS.length }, () => []);
    for (const hand of NLH_HANDS) grouped[hand.row].push(hand);
    for (const row of grouped) row.sort((a, b) => a.col - b.col);
    return grouped;
  }, []);

  const selectedHand = selectedId ? NLH_HANDS_BY_ID[selectedId] : null;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator style={styles.gridScroll}>
        <View>
          <View style={gridStyles.row}>
            <View style={gridStyles.cornerCell} />
            {RANKS.map((rank) => (
              <View key={rank} style={gridStyles.headerCell}>
                <Text style={gridStyles.headerText}>{rank}</Text>
              </View>
            ))}
          </View>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={gridStyles.row}>
              <View style={gridStyles.headerCell}>
                <Text style={gridStyles.headerText}>{RANKS[rowIndex]}</Text>
              </View>
              {row.map((hand) => {
                const strategy = strategyFor(hand, position);
                return (
                  <Pressable
                    key={hand.id}
                    onPress={() => onSelect(hand.id)}
                    style={[
                      gridStyles.cell,
                      { backgroundColor: strengthColor(hand) },
                      selectedId === hand.id && gridStyles.cellSelected,
                    ]}
                  >
                    <Text style={gridStyles.cellText} numberOfLines={1}>
                      {cellOverlayText(strategy, showAction, showFrequency, showEV) || hand.id}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      {selectedHand ? (
        <HandDetailPanel
          title={selectedHand.id}
          strategy={strategyFor(selectedHand, position)}
          strengthColor={strengthColor(selectedHand)}
          blurb={strategyBlurb(selectedHand)}
          position={position}
          onClose={() => onSelect(null)}
        />
      ) : null}
    </>
  );
}

interface PloCategoryListProps {
  position: NlhPosition;
  showAction: boolean;
  showFrequency: boolean;
  showEV: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function PloCategoryList({ position, showAction, showFrequency, showEV, selectedId, onSelect }: PloCategoryListProps) {
  const selectedCategory = selectedId ? PLO_CATEGORIES.find((entry) => entry.id === selectedId) ?? null : null;

  return (
    <>
      <View style={styles.ploList}>
        {PLO_CATEGORIES.map((category) => {
          const strategy = ploStrategyFor(category, position);
          const overlay = cellOverlayText(strategy, showAction, showFrequency, showEV);
          return (
            <Pressable
              key={category.id}
              onPress={() => onSelect(category.id)}
              style={[styles.ploRow, selectedId === category.id && styles.ploRowSelected]}
            >
              <View style={[styles.ploSwatch, { backgroundColor: ploStrengthColor(category) }]} />
              <View style={styles.ploRowCopy}>
                <Text style={styles.ploRowLabel}>{category.label}</Text>
                <Text style={styles.ploRowExample}>{category.example}</Text>
              </View>
              {overlay ? (
                <View style={styles.ploOverlayBadge}>
                  <Text style={styles.ploOverlayText}>{overlay}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {selectedCategory ? (
        <HandDetailPanel
          title={selectedCategory.label}
          strategy={ploStrategyFor(selectedCategory, position)}
          strengthColor={ploStrengthColor(selectedCategory)}
          blurb={selectedCategory.description}
          position={position}
          onClose={() => onSelect(null)}
        />
      ) : null}
    </>
  );
}

interface HandDetailPanelProps {
  title: string;
  strategy: HandStrategy;
  strengthColor: string;
  blurb: string;
  position: NlhPosition;
  onClose: () => void;
}

function HandDetailPanel({ title, strategy, strengthColor: swatch, blurb, position, onClose }: HandDetailPanelProps) {
  return (
    <View style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <View style={[styles.detailSwatch, { backgroundColor: swatch }]} />
        <Text style={styles.detailTitle}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.detailClose}>{'✕'}</Text>
        </Pressable>
      </View>
      <Text style={styles.detailSubtitle}>From {POSITION_LABELS[position]} ({position})</Text>
      <View style={styles.detailStatsRow}>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatLabel}>Action</Text>
          <Text style={styles.detailStatValue}>{strategy.actionLabel}</Text>
        </View>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatLabel}>Frequency</Text>
          <Text style={styles.detailStatValue}>{strategy.frequency}%</Text>
        </View>
        <View style={styles.detailStat}>
          <Text style={styles.detailStatLabel}>Est. EV</Text>
          <Text style={styles.detailStatValue}>{strategy.ev > 0 ? `+${strategy.ev}` : strategy.ev} bb</Text>
        </View>
      </View>
      <Text style={styles.detailBlurb}>{blurb}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedBar: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collapsedTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  chevron: { color: colors.gold, fontSize: 16, fontWeight: '900' },
  chevronDown: { transform: [{ rotate: '90deg' }] },
  container: {
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  disclaimer: { color: colors.textFaint, fontSize: 10, lineHeight: 14 },
  chipScroll: { flexGrow: 0 },
  positionRow: { flexDirection: 'row', gap: 6 },
  positionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  positionChipActive: { borderColor: colors.gold, backgroundColor: 'rgba(241,196,110,0.16)' },
  positionChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  positionChipTextActive: { color: colors.gold },
  positionCaption: { color: colors.textFaint, fontSize: 10 },
  toggleRow: { flexDirection: 'row', gap: 6 },
  toggleChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  toggleChipActive: { borderColor: colors.positive, backgroundColor: 'rgba(51,232,168,0.16)' },
  toggleChipText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  toggleChipTextActive: { color: colors.positive },
  toggleCaption: { color: colors.textFaint, fontSize: 10, lineHeight: 14 },
  gridScroll: { flexGrow: 0 },
  ploList: { gap: 6 },
  ploRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    padding: 8,
  },
  ploRowSelected: { borderColor: colors.gold },
  ploSwatch: { width: 10, height: 10, borderRadius: 5 },
  ploRowCopy: { flex: 1, gap: 1 },
  ploRowLabel: { color: colors.text, fontSize: 12, fontWeight: '800' },
  ploRowExample: { color: colors.textFaint, fontSize: 10 },
  ploOverlayBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  ploOverlayText: { color: colors.gold, fontSize: 11, fontWeight: '900' },
  detailPanel: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 10,
    backgroundColor: 'rgba(42,17,24,0.7)',
    padding: 10,
    gap: 6,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailSwatch: { width: 12, height: 12, borderRadius: 6 },
  detailTitle: { color: colors.text, fontSize: 14, fontWeight: '900', flex: 1 },
  detailClose: { color: colors.textMuted, fontSize: 13, fontWeight: '900' },
  detailSubtitle: { color: colors.textMuted, fontSize: 11 },
  detailStatsRow: { flexDirection: 'row', gap: 8 },
  detailStat: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 1,
  },
  detailStatLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  detailStatValue: { color: colors.text, fontSize: 13, fontWeight: '900' },
  detailBlurb: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});

const gridStyles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cornerCell: { width: 22, height: 22 },
  headerCell: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  headerText: { color: colors.textFaint, fontSize: 10, fontWeight: '900' },
  cell: {
    width: 26,
    height: 26,
    margin: 0.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { borderWidth: 2, borderColor: colors.gold },
  cellText: { color: '#0B0A08', fontSize: 8, fontWeight: '900' },
});
