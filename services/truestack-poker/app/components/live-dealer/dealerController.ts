import { useEffect, useRef, useState } from 'react';
import type { DealerSceneCue } from './types';

interface DealerControlledTableState {
  currentStreet: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  pot: number;
  players: Array<{ id: string }>;
  currentTurn: string | null;
}

const IDLE_CUE: DealerSceneCue = {
  id: 'idle-0',
  animation: 'idle',
  cameraMode: 'table',
  statusLabel: 'Ready for the next hand',
  durationMs: 0,
  startedAt: 0,
};

export function useDealerController(table: DealerControlledTableState | null, connected: boolean): DealerSceneCue {
  const [cue, setCue] = useState<DealerSceneCue>(IDLE_CUE);
  const cueIndexRef = useRef(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRef = useRef<DealerControlledTableState | null>(null);

  function queueCue(next: Omit<DealerSceneCue, 'id' | 'startedAt'>): void {
    cueIndexRef.current += 1;
    const startedAt = Date.now();
    setCue({
      ...next,
      id: `${next.animation}-${cueIndexRef.current}`,
      startedAt,
    });

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    if (next.durationMs > 0) {
      resetTimerRef.current = setTimeout(() => {
        setCue({
          ...IDLE_CUE,
          id: `idle-${cueIndexRef.current}`,
          startedAt: Date.now(),
        });
      }, next.durationMs);
    }
  }

  useEffect(() => {
    if (!connected || !table) return;

    if (!previousRef.current) {
      previousRef.current = table;
      queueCue({
        animation: 'shuffle',
        cameraMode: 'dealer',
        statusLabel: 'Dealer shuffling and opening the hand',
        durationMs: 2600,
        voiceLine: 'Shuffling up and dealing.',
      });
      return;
    }

    const previous = previousRef.current;

    if (previous.players.length === 0 && table.players.length > 0) {
      queueCue({
        animation: 'deal-hole',
        cameraMode: 'table',
        statusLabel: 'Dealing opening hands',
        durationMs: 2400,
      });
    } else if (previous.currentStreet !== table.currentStreet) {
      if (table.currentStreet === 'flop') {
        queueCue({
          animation: 'deal-flop',
          cameraMode: 'board',
          statusLabel: 'Burn and turn the flop',
          durationMs: 2600,
        });
      } else if (table.currentStreet === 'turn') {
        queueCue({
          animation: 'deal-turn',
          cameraMode: 'board',
          statusLabel: 'Burn and deal the turn',
          durationMs: 2200,
        });
      } else if (table.currentStreet === 'river') {
        queueCue({
          animation: 'deal-river',
          cameraMode: 'board',
          statusLabel: 'Burn and deal the river',
          durationMs: 2200,
        });
      } else if (table.currentStreet === 'showdown') {
        queueCue({
          animation: 'push-pot',
          cameraMode: 'winner',
          statusLabel: 'Settling the pot',
          durationMs: 2200,
        });
      }
    } else if (previous.currentTurn !== table.currentTurn && table.currentTurn) {
      queueCue({
        animation: 'wait-action',
        cameraMode: 'table',
        statusLabel: 'Waiting for player action',
        durationMs: 1800,
      });
    } else if (table.pot > previous.pot + 10) {
      queueCue({
        animation: 'collect-chips',
        cameraMode: 'table',
        statusLabel: 'Collecting chips into the pot',
        durationMs: 1600,
      });
    }

    previousRef.current = table;
  }, [connected, table]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  return cue;
}
