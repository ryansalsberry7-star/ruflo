import { StyleSheet, Text, View } from 'react-native';
import type { TablePreferences } from '../../lib/tablePreferences';
import { useDealerAudioController } from './useDealerAudioController';
import { DealerCardOverlay } from './DealerCardOverlay';
import { DealerScene } from './DealerScene';
import { resolveDealerRenderProfile } from './useDealerRenderProfile';
import type { DealerSceneCue, DealerSeatTarget } from './types';

interface DealerStageProps {
  cue: DealerSceneCue;
  preferences: TablePreferences;
  viewportWidth: number;
  tableWidth: number;
  tableHeight: number;
  seatTargets: DealerSeatTarget[];
}

export function DealerStage({ cue, preferences, viewportWidth, tableWidth, tableHeight, seatTargets }: DealerStageProps) {
  const renderProfile = resolveDealerRenderProfile(preferences.liveDealerQuality, viewportWidth);
  useDealerAudioController(cue, preferences);

  if (!preferences.liveDealerEnabled) {
    return (
      <View style={styles.fallbackWrap}>
        <View style={styles.fallbackBadge}>
          <Text style={styles.fallbackIcon}>D</Text>
        </View>
        <View style={styles.fallbackCopy}>
          <Text style={styles.fallbackTitle}>Virtual dealer active</Text>
          <Text style={styles.fallbackText}>Gameplay remains fully server-authoritative with the cinematic dealer disabled.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stageWrap}>
      <DealerScene cue={cue} renderProfile={renderProfile} preferences={preferences} />
      <DealerCardOverlay cue={cue} seatTargets={seatTargets} renderProfile={renderProfile} tableWidth={tableWidth} tableHeight={tableHeight} />
      <View style={styles.statusPill}>
        <Text style={styles.statusEyebrow}>{renderProfile.qualityTier.toUpperCase()} LIVE DEALER</Text>
        <Text style={styles.statusText}>{cue.statusLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stageWrap: {
    flex: 1,
  },
  statusPill: {
    position: 'absolute',
    right: 12,
    top: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(19,10,13,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(241,196,110,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 1,
  },
  statusEyebrow: {
    color: '#F1C46E',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  statusText: {
    color: '#FFF4E7',
    fontSize: 11,
    fontWeight: '700',
  },
  fallbackWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(22,10,13,0.88)',
    borderColor: '#7A4A53',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 10,
  },
  fallbackBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F2F5',
    borderWidth: 1,
    borderColor: '#13161D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    color: '#13161D',
    fontSize: 14,
    fontWeight: '900',
  },
  fallbackCopy: {
    flex: 1,
    gap: 2,
  },
  fallbackTitle: {
    color: '#FFF4E7',
    fontSize: 14,
    fontWeight: '800',
  },
  fallbackText: {
    color: '#D5BBB2',
    fontSize: 11,
    lineHeight: 16,
  },
});
