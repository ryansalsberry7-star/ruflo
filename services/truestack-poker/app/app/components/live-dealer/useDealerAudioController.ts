import { useEffect } from 'react';
import type { TablePreferences } from '../../lib/tablePreferences';
import type { DealerSceneCue } from './types';

export function useDealerAudioController(cue: DealerSceneCue, preferences: TablePreferences): void {
  useEffect(() => {
    if (!preferences.soundEffectsEnabled) return;
    if (preferences.dealerVoiceEnabled && cue.voiceLine) {
      // Intentionally reserved for synchronized dealer VO asset playback.
    }

    if (preferences.ambientEffectsEnabled) {
      // Intentionally reserved for table ambience and movement SFX routing.
    }
  }, [cue, preferences]);
}
