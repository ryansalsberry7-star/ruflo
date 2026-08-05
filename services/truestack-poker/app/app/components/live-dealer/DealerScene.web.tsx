import { StyleSheet, Text, View } from 'react-native';
import type { TablePreferences } from '../../lib/tablePreferences';
import type { DealerRenderProfile, DealerSceneCue } from './types';

interface DealerSceneProps {
  cue: DealerSceneCue;
  renderProfile: DealerRenderProfile;
  preferences: TablePreferences;
}

export function DealerScene({ cue, renderProfile, preferences }: DealerSceneProps) {
  const skinLabel =
    preferences.dealerSkinId === 'classic-casino-dealer'
      ? 'Classic Casino Dealer'
      : preferences.dealerSkinId === 'luxury-tournament-dealer'
        ? 'Luxury Tournament Dealer'
        : preferences.dealerSkinId === 'modern-professional-dealer'
          ? 'Modern Professional Dealer'
          : 'VIP Dealer';

  return (
    <View style={styles.scene}>
      <View style={styles.skylineBand}>
        <View style={styles.palmLeft} />
        <View style={styles.palmRight} />
        <View style={styles.balconyRail} />
      </View>
      <View style={styles.stageArch} />
      <View style={styles.stageGlow} />
      <View style={styles.dealerBust}>
        <View style={styles.hairBack} />
        <View style={styles.neck} />
        <View style={styles.earLeft} />
        <View style={styles.earRight} />
        <View style={styles.head}>
          <View style={styles.faceShade} />
          <View style={styles.browRow}>
            <View style={[styles.brow, styles.browLeft]} />
            <View style={[styles.brow, styles.browRight]} />
          </View>
          <View style={styles.eyeRow}>
            <View style={styles.eye}>
              <View style={styles.eyeHighlight} />
            </View>
            <View style={styles.eye}>
              <View style={styles.eyeHighlight} />
            </View>
          </View>
          <View style={styles.nose} />
          <View style={styles.mouth} />
        </View>
        <View style={styles.shoulders}>
          <View style={styles.shirt} />
          <View style={styles.lapelLeft} />
          <View style={styles.lapelRight} />
          <View style={styles.tie} />
          <View style={styles.tieKnot} />
        </View>
      </View>
      <View style={styles.stageDesk}>
        <View style={styles.stageDeskTrim} />
      </View>
      <View style={styles.caption}>
        <Text style={styles.eyebrow}>LIVE DEALER BOOTH</Text>
        <Text style={styles.title}>{skinLabel}</Text>
        <Text style={styles.meta}>
          {cue.statusLabel} • {renderProfile.qualityTier} quality
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#D8DDE3',
    overflow: 'hidden',
  },
  skylineBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
    backgroundColor: '#BEDCEE',
  },
  palmLeft: {
    position: 'absolute',
    left: 10,
    top: 10,
    width: 72,
    height: 52,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 34,
    backgroundColor: 'rgba(49,94,62,0.26)',
    transform: [{ rotate: '-11deg' }],
  },
  palmRight: {
    position: 'absolute',
    right: 10,
    top: 14,
    width: 80,
    height: 48,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 42,
    borderBottomLeftRadius: 34,
    backgroundColor: 'rgba(49,94,62,0.22)',
    transform: [{ rotate: '11deg' }],
  },
  balconyRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    height: 12,
    backgroundColor: '#ECE8E0',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#918A7E',
  },
  stageArch: {
    position: 'absolute',
    top: '22%',
    width: '84%',
    height: '54%',
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: '#E9E4D8',
    borderWidth: 2,
    borderColor: '#C0B6A5',
  },
  stageGlow: {
    position: 'absolute',
    top: '27%',
    width: '60%',
    height: '44%',
    borderRadius: 999,
    backgroundColor: 'rgba(230,186,74,0.18)',
  },
  dealerBust: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 18,
  },
  hairBack: {
    position: 'absolute',
    top: 2,
    width: 58,
    height: 40,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 20,
    backgroundColor: '#3B2A22',
    transform: [{ rotate: '-2deg' }],
  },
  neck: {
    position: 'absolute',
    bottom: 46,
    width: 20,
    height: 16,
    borderRadius: 6,
    backgroundColor: '#C79A7C',
  },
  earLeft: {
    position: 'absolute',
    bottom: 55,
    left: 34,
    width: 8,
    height: 12,
    borderRadius: 5,
    backgroundColor: '#D7B097',
  },
  earRight: {
    position: 'absolute',
    bottom: 55,
    right: 34,
    width: 8,
    height: 12,
    borderRadius: 5,
    backgroundColor: '#D7B097',
  },
  head: {
    width: 46,
    height: 50,
    borderRadius: 23,
    backgroundColor: '#D7B097',
    marginBottom: 8,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  faceShade: {
    position: 'absolute',
    right: -6,
    top: 4,
    width: 26,
    height: 46,
    borderRadius: 20,
    backgroundColor: 'rgba(120,82,58,0.16)',
  },
  browRow: {
    width: 26,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  brow: {
    width: 8,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#3B2A22',
  },
  browLeft: {
    transform: [{ rotate: '-8deg' }],
  },
  browRight: {
    transform: [{ rotate: '8deg' }],
  },
  eyeRow: {
    width: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  eye: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#31261F',
    alignItems: 'flex-end',
  },
  eyeHighlight: {
    width: 1.5,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: '#F4F1EA',
    marginTop: 0.5,
  },
  nose: {
    width: 3,
    height: 7,
    borderRadius: 2,
    backgroundColor: 'rgba(120,82,58,0.28)',
    marginBottom: 3,
  },
  mouth: {
    width: 12,
    height: 3,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#9C5C4C',
  },
  shoulders: {
    width: 116,
    height: 82,
    borderTopLeftRadius: 46,
    borderTopRightRadius: 46,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    backgroundColor: '#1C1F27',
    borderWidth: 2,
    borderColor: '#E1BE73',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  shirt: {
    width: 34,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F4F1EA',
  },
  lapelLeft: {
    position: 'absolute',
    top: 8,
    left: 30,
    width: 16,
    height: 26,
    backgroundColor: '#14161C',
    transform: [{ rotate: '22deg' }],
    borderTopRightRadius: 4,
  },
  lapelRight: {
    position: 'absolute',
    top: 8,
    right: 30,
    width: 16,
    height: 26,
    backgroundColor: '#14161C',
    transform: [{ rotate: '-22deg' }],
    borderTopLeftRadius: 4,
  },
  tie: {
    position: 'absolute',
    top: 24,
    width: 8,
    height: 38,
    borderRadius: 4,
    backgroundColor: '#B78A3A',
  },
  tieKnot: {
    position: 'absolute',
    top: 18,
    width: 11,
    height: 8,
    borderRadius: 3,
    backgroundColor: '#C79A42',
  },
  stageDesk: {
    position: 'absolute',
    bottom: 28,
    width: '76%',
    height: 22,
    borderRadius: 11,
    backgroundColor: '#6D3C1F',
    borderWidth: 1,
    borderColor: '#4E2A15',
  },
  stageDeskTrim: {
    position: 'absolute',
    top: 3,
    left: 14,
    right: 14,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D3C7B4',
  },
  caption: {
    position: 'absolute',
    bottom: 8,
    alignItems: 'center',
    gap: 1,
    backgroundColor: 'rgba(249,244,236,0.88)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  eyebrow: {
    color: '#8C6D39',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    color: '#342E29',
    fontSize: 12,
    fontWeight: '800',
  },
  meta: {
    color: '#6E655C',
    fontSize: 10,
  },
});
