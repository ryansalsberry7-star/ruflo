import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';
import {
  clampRaiseTo,
  formatChips,
  getLegalActions,
  getSizingOptions,
  resolvePreAction,
  type ActionKind,
  type PreAction,
  type TableState,
} from '../lib/betting';

interface ActionBarProps {
  table: TableState | null;
  playerId: string | null;
  seated: boolean;
  countdown: number | null;
  turnActionSeconds: number;
  onAction: (type: ActionKind, amount?: number) => void;
}

/**
 * The pinned action bar.
 *
 * Renders only the actions the server would accept, with live amounts on the labels,
 * so the button set teaches the rules instead of producing a rejection when someone
 * taps "Check" into a bet. Sits outside the table's ScrollView: a 20-second turn timer
 * leaves no room for scrolling to find Fold.
 */
export function ActionBar({ table, playerId, seated, countdown, turnActionSeconds, onAction }: ActionBarProps) {
  const legal = useMemo(() => getLegalActions(table, playerId), [table, playerId]);
  const sizingOptions = useMemo(() => getSizingOptions(table, legal), [table, legal]);
  const isMyTurn = !!table && !!playerId && table.currentTurn === playerId;
  const canSize = legal.canBet || legal.canRaise;

  const [raiseTo, setRaiseTo] = useState(0);
  const [preAction, setPreAction] = useState<PreAction>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // Re-anchor the slider whenever a new decision starts, so it never carries a stale
  // amount from the previous street into this one.
  useEffect(() => {
    if (canSize) setRaiseTo(legal.minRaiseTo);
  }, [canSize, legal.minRaiseTo, legal.maxRaiseTo]);

  // Fire an armed pre-action the moment the action actually arrives.
  useEffect(() => {
    if (!isMyTurn || !preAction) return;
    const resolved = resolvePreAction(preAction, legal);
    setPreAction(null);
    if (resolved) onAction(resolved, resolved === 'call' ? legal.amountToCall : undefined);
  }, [isMyTurn, preAction, legal, onAction]);

  // Latest values for the pan handlers, which capture their closure once on mount.
  const sizingRef = useRef({ min: 0, max: 0, width: 0 });
  sizingRef.current = { min: legal.minRaiseTo, max: legal.maxRaiseTo, width: trackWidth };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { min, max, width } = sizingRef.current;
          if (width <= 0 || max <= min) return;
          const ratio = Math.min(Math.max(event.nativeEvent.locationX / width, 0), 1);
          setRaiseTo(Math.round((min + ratio * (max - min)) * 100) / 100);
        },
        onPanResponderMove: (event, gesture) => {
          const { min, max, width } = sizingRef.current;
          if (width <= 0 || max <= min) return;
          // locationX is unreliable mid-drag on some platforms; derive from the start
          // position plus accumulated dx instead.
          const startX = event.nativeEvent.locationX - gesture.dx;
          const ratio = Math.min(Math.max((startX + gesture.dx) / width, 0), 1);
          setRaiseTo(Math.round((min + ratio * (max - min)) * 100) / 100);
        },
      }),
    []
  );

  if (!seated) {
    return (
      <View style={styles.bar}>
        <Text style={styles.hint}>Tap an open seat to join the table</Text>
      </View>
    );
  }

  if (!isMyTurn) {
    return (
      <View style={styles.bar}>
        <Text style={styles.waiting}>Waiting for your turn</Text>
        <View style={styles.preRow}>
          {(
            [
              { key: 'check-fold', label: 'Check/Fold' },
              { key: 'call-any', label: 'Call Any' },
              { key: 'fold', label: 'Fold Now' },
            ] as Array<{ key: Exclude<PreAction, null>; label: string }>
          ).map((option) => (
            <Pressable
              key={option.key}
              style={[styles.preChip, preAction === option.key && styles.preChipOn]}
              onPress={() => setPreAction(preAction === option.key ? null : option.key)}
            >
              <View style={[styles.checkbox, preAction === option.key && styles.checkboxOn]}>
                {preAction === option.key ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={[styles.preLabel, preAction === option.key && styles.preLabelOn]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  const urgent = countdown !== null && countdown <= 5;
  const timerRatio = countdown !== null ? Math.min(Math.max(countdown / turnActionSeconds, 0), 1) : 0;

  return (
    <View style={[styles.bar, styles.barActive]}>
      {countdown !== null ? (
        <View style={styles.timerTrack}>
          <View
            style={[styles.timerFill, { width: `${timerRatio * 100}%` }, urgent && styles.timerFillUrgent]}
          />
        </View>
      ) : null}

      {canSize ? (
        <>
          <View style={styles.sizeRow}>
            {sizingOptions.map((option) => (
              <Pressable
                key={option.label}
                style={[styles.sizeChip, raiseTo === option.raiseTo && styles.sizeChipOn]}
                onPress={() => setRaiseTo(option.raiseTo)}
              >
                <Text style={[styles.sizeLabel, raiseTo === option.raiseTo && styles.sizeLabelOn]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sliderRow}>
            <Pressable
              style={styles.stepButton}
              onPress={() => setRaiseTo(clampRaiseTo(raiseTo - (table?.bigBlind ?? 1), legal))}
            >
              <Text style={styles.stepText}>−</Text>
            </Pressable>

            <View
              style={styles.sliderTrack}
              onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
              {...panResponder.panHandlers}
            >
              <View
                style={[
                  styles.sliderFill,
                  {
                    width:
                      legal.maxRaiseTo > legal.minRaiseTo
                        ? `${((raiseTo - legal.minRaiseTo) / (legal.maxRaiseTo - legal.minRaiseTo)) * 100}%`
                        : '0%',
                  },
                ]}
              />
              <Text style={styles.sliderValue}>{formatChips(raiseTo)}</Text>
            </View>

            <Pressable
              style={styles.stepButton}
              onPress={() => setRaiseTo(clampRaiseTo(raiseTo + (table?.bigBlind ?? 1), legal))}
            >
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <View style={styles.actionRow}>
        {legal.canFold ? (
          <Pressable style={[styles.action, styles.foldAction]} onPress={() => onAction('fold')}>
            <Text style={styles.actionText}>Fold</Text>
          </Pressable>
        ) : null}

        {/* Check and Call are mutually exclusive -- only one can ever be legal. */}
        {legal.canCheck ? (
          <Pressable style={[styles.action, styles.callAction]} onPress={() => onAction('check')}>
            <Text style={styles.actionText}>Check</Text>
          </Pressable>
        ) : null}

        {legal.canCall ? (
          <Pressable
            style={[styles.action, styles.callAction]}
            onPress={() => onAction('call', legal.amountToCall)}
          >
            <Text style={styles.actionText}>Call</Text>
            <Text style={styles.actionAmount}>{formatChips(legal.amountToCall)}</Text>
          </Pressable>
        ) : null}

        {legal.canBet || legal.canRaise ? (
          <Pressable
            style={[styles.action, styles.raiseAction]}
            onPress={() => onAction(legal.canBet ? 'bet' : 'raise', raiseTo)}
          >
            <Text style={styles.actionTextDark}>{legal.canBet ? 'Bet' : 'Raise to'}</Text>
            <Text style={styles.actionAmountDark}>{formatChips(raiseTo)}</Text>
          </Pressable>
        ) : (
          legal.canAllIn && (
            <Pressable style={[styles.action, styles.raiseAction]} onPress={() => onAction('all-in')}>
              <Text style={styles.actionTextDark}>All-in</Text>
              <Text style={styles.actionAmountDark}>{formatChips(legal.maxRaiseTo)}</Text>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 8,
  },
  barActive: { backgroundColor: colors.surfaceRaised },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  waiting: { color: colors.textFaint, fontSize: 12, textAlign: 'center', letterSpacing: 1 },

  preRow: { flexDirection: 'row', gap: 8 },
  preChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  preChipOn: { borderColor: colors.gold, backgroundColor: '#3A1E22' },
  checkbox: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  checkmark: { color: '#2A1118', fontSize: 10, fontWeight: '900', lineHeight: 12 },
  preLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  preLabelOn: { color: colors.text },

  timerTrack: { height: 3, borderRadius: 2, backgroundColor: colors.borderSubtle, overflow: 'hidden' },
  timerFill: { height: 3, backgroundColor: colors.gold },
  timerFillUrgent: { backgroundColor: colors.danger },

  sizeRow: { flexDirection: 'row', gap: 6 },
  sizeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  sizeChipOn: { borderColor: colors.gold, backgroundColor: '#3A1E22' },
  sizeLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  sizeLabelOn: { color: colors.gold },

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: colors.text, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  sliderTrack: {
    flex: 1,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#3A1E22' },
  sliderValue: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },

  actionRow: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foldAction: { backgroundColor: colors.fold },
  callAction: { backgroundColor: colors.call },
  raiseAction: { backgroundColor: colors.gold },
  actionText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  actionAmount: { color: colors.text, fontSize: 12, fontWeight: '600', opacity: 0.85 },
  actionTextDark: { color: '#2A1118', fontSize: 15, fontWeight: '900' },
  actionAmountDark: { color: '#2A1118', fontSize: 12, fontWeight: '700', opacity: 0.8 },
});
