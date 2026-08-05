import type { LiveDealerQuality, TablePreferences } from '../../lib/tablePreferences';

export type DealerAnimationCue =
  | 'idle'
  | 'shuffle'
  | 'tap-deck'
  | 'burn-card'
  | 'deal-hole'
  | 'deal-flop'
  | 'deal-turn'
  | 'deal-river'
  | 'collect-chips'
  | 'push-pot'
  | 'show-button'
  | 'wait-action';

export type DealerCameraMode = 'table' | 'dealer' | 'board' | 'winner';

export interface DealerSceneCue {
  id: string;
  animation: DealerAnimationCue;
  cameraMode: DealerCameraMode;
  statusLabel: string;
  durationMs: number;
  startedAt: number;
  voiceLine?: string;
}

export interface DealerSeatTarget {
  id: string;
  x: number;
  y: number;
}

export interface DealerRenderProfile {
  qualityTier: Exclude<LiveDealerQuality, 'auto'>;
  antialias: boolean;
  shadowOpacity: number;
  blinkScale: number;
  holeCardLimit: number;
  cameraResponsiveness: number;
  ambientIntensity: number;
}

export interface DealerSkinPalette {
  jacket: string;
  shirt: string;
  tie: string;
  skin: string;
  rail: string;
  accent: string;
}

export const DEALER_SKIN_PALETTES: Record<TablePreferences['dealerSkinId'], DealerSkinPalette> = {
  'classic-casino-dealer': {
    jacket: '#1B1E26',
    shirt: '#F4F1EA',
    tie: '#B48A3A',
    skin: '#D8B39A',
    rail: '#281A14',
    accent: '#E1BE73',
  },
  'luxury-tournament-dealer': {
    jacket: '#171A21',
    shirt: '#F6F0E6',
    tie: '#8E5E2F',
    skin: '#D9B298',
    rail: '#2B1B15',
    accent: '#D59B58',
  },
  'modern-professional-dealer': {
    jacket: '#1A202A',
    shirt: '#EEF1F5',
    tie: '#5F7F96',
    skin: '#D1A88F',
    rail: '#1E1818',
    accent: '#A6C7D9',
  },
  'vip-dealer': {
    jacket: '#171116',
    shirt: '#F7EFE3',
    tie: '#A8782F',
    skin: '#D9B19A',
    rail: '#281511',
    accent: '#F0C067',
  },
};
