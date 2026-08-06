import { memo, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, displayFontSemibold } from '../lib/theme';
import type { GameVariant } from '../lib/betting';
import {
  NLH_HANDS,
  NLH_HANDS_BY_ID,
  NLH_POSITIONS,
  OPEN_PERCENT,
  PLO_CATEGORIES,
  PLO_OPEN_PERCENT,
  POSITION_LABELS,
  RANKS,
  ploStrategyFor,
  ploStrengthColor,
  strategyBlurb,
  strategyFor,
  strengthColor,
  strengthTier,
  type ActionTier,
  type HandStrategy,
  type NlhHand,
  type NlhPosition,
  type StrengthTier,
} from '../lib/handRanges';

interface StartingHandMatrixProps {
  variant: GameVariant;
  defaultExpanded?: boolean;
}

const ACTION_CODE: Record<ActionTier, string> = { raise: 'R', mixed: 'M', occasional: '?', fold: '' };

type MatrixTab = 'range' | 'frequency' | 'ev' | 'notes';
const MATRIX_TABS: Array<{ key: MatrixTab; label: string }> = [
  { key: 'range', label: 'Range' },
  { key: 'frequency', label: 'Frequency' },
  { key: 'ev', label: 'EV' },
  { key: 'notes', label: 'Notes' },
];

const STRENGTH_ORDER: StrengthTier[] = ['weak', 'marginal', 'playable', 'strong', 'premium'];

/** Linear interpolation between two hex colors, t clamped to [0,1]. */
function mixHex(from: string, to: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channel = (shift: number) => {
    const av = (a >> shift) & 255;
    const bv = (b >> shift) & 255;
    return Math.round(av + (bv - av) * clamped);
  };
  const r = channel(16);
  const g = channel(8);
  const bl = channel(0);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Single-hue intensity step: a dim neutral base brightening toward `hue` as t rises to 1.
 *  Text flips to dark ink once the cell is bright enough to need it -- this is what makes
 *  the grid read as a heatmap (one color, varying intensity) instead of the old palette of
 *  five unrelated hues. */
function heatCell(t: number, hue: string): { bg: string; text: string } {
  const bg = mixHex('#1B2320', hue, Math.max(0, Math.min(1, t)));
  return { bg, text: t < 0.45 ? 'rgba(242,240,234,0.9)' : colors.ink };
}

/** EV is signed -- a diverging scale (coral for negative, mint for positive) reads far
 *  more like a trading-terminal P&L than a single ramp would. */
function evHeatCell(ev: number): { bg: string; text: string } {
  const norm = Math.max(-1, Math.min(1, ev / 5));
  return norm >= 0 ? heatCell(norm, colors.positive) : heatCell(-norm, colors.danger);
}

function cellVisual(tab: MatrixTab, tier: StrengthTier, strategy: HandStrategy): { bg: string; text: string } {
  if (tab === 'frequency') return heatCell(strategy.frequency / 100, colors.dataAmber);
  if (tab === 'ev') return evHeatCell(strategy.ev);
  return heatCell(STRENGTH_ORDER.indexOf(tier) / (STRENGTH_ORDER.length - 1), colors.mint);
}

/**
 * Collapsed by default (unless `defaultExpanded`), and the entire grid/category list (data
 * lookups, cell components) only mounts once expanded, so a player who never opens this pays no
 * rendering or computation cost for it. Memoized on `variant` alone -- table.tsx re-renders on
 * every websocket tick, but this component has no reason to follow along.
 */
function StartingHandMatrixImpl({ variant, defaultExpanded = false }: StartingHandMatrixProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [position, setPosition] = useState<NlhPosition>('CO');
  const [activeTab, setActiveTab] = useState<MatrixTab>('range');
  const [selectedHandId, setSelectedHandId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  // Ephemeral, per session -- not persisted to disk. A quick place to jot a read during
  // play, not a full note-taking feature.
  const [notes, setNotes] = useState<Record<string, string>>({});

  const openPercent = variant === 'plo' ? PLO_OPEN_PERCENT[position] : OPEN_PERCENT[position];
  const insight = `${position} opens ${Math.round(openPercent)}% here`;

  if (!expanded) {
    return (
      <Pressable style={styles.collapsedBar} onPress={() => setExpanded(true)}>
        <View>
          <Text style={styles.collapsedTitle}>Starting Hand Matrix</Text>
          {/* Pinned insight -- visible even collapsed, so it's not locked behind opening
              the whole study layer during a hand. */}
          <Text style={styles.collapsedInsight}>{insight}</Text>
        </View>
        <Text style={styles.chevron}>{'›'}</Text>
      </Pressable>
    );
  }

  const notesKey = `${variant}:${position}`;

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
      <View style={styles.insightPill}>
        <Text style={styles.insightText}>{insight}</Text>
      </View>

      <View style={styles.tabRow}>
        {MATRIX_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabChip, activeTab === tab.key && styles.tabChipActive]}
          >
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'notes' ? (
        <View style={styles.notesWrap}>
          <Text style={styles.toggleCaption}>Reads and reminders for {POSITION_LABELS[position]} ({position}). Cleared when the app restarts.</Text>
          <TextInput
            style={styles.notesInput}
            value={notes[notesKey] ?? ''}
            onChangeText={(text) => setNotes((current) => ({ ...current, [notesKey]: text }))}
            placeholder={`e.g. "Villain opens ${position} way too wide -- 3-bet light here."`}
            placeholderTextColor={colors.textFaint}
            multiline
          />
        </View>
      ) : (
        <>
          <Text style={styles.toggleCaption}>
            {activeTab === 'range'
              ? 'Heatmap shades by hand strength -- tap any hand for the full breakdown.'
              : activeTab === 'frequency'
                ? 'Heatmap shades by how often the range opens this hand.'
                : 'Diverging heatmap: coral for -EV, mint for +EV, by magnitude.'}
          </Text>
          {variant === 'plo' ? (
            <PloCategoryList
              position={position}
              activeTab={activeTab}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
            />
          ) : (
            <NlhGrid position={position} activeTab={activeTab} selectedId={selectedHandId} onSelect={setSelectedHandId} />
          )}
        </>
      )}
    </View>
  );
}

export const StartingHandMatrix = memo(StartingHandMatrixImpl);

function cellOverlayText(strategy: HandStrategy, tab: MatrixTab): string {
  if (tab === 'range') return ACTION_CODE[strategy.action];
  if (tab === 'frequency') return strategy.action === 'fold' ? '' : `${strategy.frequency}`;
  if (tab === 'ev') return strategy.action === 'fold' ? '' : `${strategy.ev}`;
  return '';
}

interface NlhGridProps {
  position: NlhPosition;
  activeTab: MatrixTab;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function NlhGrid({ position, activeTab, selectedId, onSelect }: NlhGridProps) {
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
                const visual = cellVisual(activeTab, strengthTier(hand), strategy);
                return (
                  <Pressable
                    key={hand.id}
                    onPress={() => onSelect(hand.id)}
                    style={[gridStyles.cell, { backgroundColor: visual.bg }, selectedId === hand.id && gridStyles.cellSelected]}
                  >
                    <Text style={[gridStyles.cellText, { color: visual.text }]} numberOfLines={1}>
                      {cellOverlayText(strategy, activeTab) || hand.id}
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
  activeTab: MatrixTab;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function PloCategoryList({ position, activeTab, selectedId, onSelect }: PloCategoryListProps) {
  const selectedCategory = selectedId ? PLO_CATEGORIES.find((entry) => entry.id === selectedId) ?? null : null;

  return (
    <>
      <View style={styles.ploList}>
        {PLO_CATEGORIES.map((category) => {
          const strategy = ploStrategyFor(category, position);
          const overlay = cellOverlayText(strategy, activeTab);
          const visual = cellVisual(activeTab, category.strength, strategy);
          return (
            <Pressable
              key={category.id}
              onPress={() => onSelect(category.id)}
              style={[styles.ploRow, selectedId === category.id && styles.ploRowSelected]}
            >
              <View style={[styles.ploSwatch, { backgroundColor: visual.bg }]} />
              <View style={styles.ploRowCopy}>
                <Text style={styles.ploRowLabel}>{category.label}</Text>
                <Text style={styles.ploRowExample}>{category.example}</Text>
              </View>
              {overlay ? (
                <View style={[styles.ploOverlayBadge, { backgroundColor: visual.bg }]}>
                  <Text style={[styles.ploOverlayText, { color: visual.text }]}>{overlay}</Text>
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
  collapsedTitle: { color: colors.text, fontSize: 14, fontWeight: '800', ...displayFontSemibold },
  collapsedInsight: { color: colors.mint, fontSize: 10, fontWeight: '700', marginTop: 2 },
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
  headerTitle: { color: colors.text, fontSize: 14, fontWeight: '800', ...displayFontSemibold },
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
  positionChipActive: { borderColor: colors.gold, backgroundColor: 'rgba(203,178,126,0.16)' },
  positionChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  positionChipTextActive: { color: colors.gold },
  // Pinned insight -- a single computed fact ("CO opens 27% here") rather than the old
  // static "opening range if first to act" caption, and left visible regardless of tab.
  insightPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(47,229,174,0.35)',
    backgroundColor: 'rgba(47,229,174,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  insightText: { color: colors.mint, fontSize: 10, fontWeight: '800' },
  // Single-select tab row -- was three independent toggle checkboxes that could all be
  // on (or off) at once, which doesn't match "the grid shows one value at a time."
  tabRow: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabChip: { flex: 1, paddingVertical: 7, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabChipActive: { borderBottomColor: colors.gold },
  tabLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  tabLabelActive: { color: colors.gold },
  toggleCaption: { color: colors.textFaint, fontSize: 10, lineHeight: 14 },
  notesWrap: { gap: 6 },
  notesInput: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    padding: 8,
    textAlignVertical: 'top',
  },
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
  // Tighter margin and a sharper corner than before -- a heatmap reads as a continuous
  // surface, and visible gaps + rounded-pill cells were pulling it toward "buttons."
  cell: {
    width: 24,
    height: 24,
    margin: 0.5,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { borderWidth: 1.5, borderColor: colors.gold },
  cellText: { fontSize: 8, fontWeight: '900' },
});
