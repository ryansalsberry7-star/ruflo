import { Platform } from 'react-native';
import type { LiveDealerQuality } from '../../lib/tablePreferences';
import type { DealerRenderProfile } from './types';

export function resolveDealerRenderProfile(preferredQuality: LiveDealerQuality, viewportWidth: number): DealerRenderProfile {
  const qualityTier =
    preferredQuality === 'auto'
      ? viewportWidth >= 420 && Platform.OS === 'ios'
        ? 'high'
        : viewportWidth >= 360
          ? 'balanced'
          : 'lite'
      : preferredQuality;

  if (qualityTier === 'high') {
    return {
      qualityTier,
      antialias: true,
      shadowOpacity: 0.26,
      blinkScale: 1,
      holeCardLimit: 9,
      cameraResponsiveness: 0.12,
      ambientIntensity: 1.9,
    };
  }

  if (qualityTier === 'balanced') {
    return {
      qualityTier,
      antialias: true,
      shadowOpacity: 0.18,
      blinkScale: 0.8,
      holeCardLimit: 5,
      cameraResponsiveness: 0.1,
      ambientIntensity: 1.5,
    };
  }

  return {
    qualityTier,
    antialias: false,
    shadowOpacity: 0.1,
    blinkScale: 0.55,
    holeCardLimit: 2,
    cameraResponsiveness: 0.08,
    ambientIntensity: 1.25,
  };
}
