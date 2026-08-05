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
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#D8DDE3',
    borderWidth: 1,
    borderColor: '#8B857B',
  },
  statusPill: {
    position: 'absolute',
    right: 12,
    top: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(249,244,236,0.92)',
    borderWidth: 1,
    borderColor: '#B7AA90',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 1,
  },
  statusEyebrow: {
    color: '#8C6D39',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  statusText: {
    color: '#3D3730',
    fontSize: 11,
    fontWeight: '700',
  },
  fallbackWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#EEECE5',
    borderColor: '#B7AA90',
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
    backgroundColor: '#C6C7C9',
    borderWidth: 1,
    borderColor: '#7E776D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    color: '#342E29',
    fontSize: 14,
    fontWeight: '900',
  },
  fallbackCopy: {
    flex: 1,
    gap: 2,
  },
  fallbackTitle: {
    color: '#342E29',
    fontSize: 14,
    fontWeight: '800',
  },
  fallbackText: {
    color: '#6E655C',
    fontSize: 11,
    lineHeight: 16,
  },
});
