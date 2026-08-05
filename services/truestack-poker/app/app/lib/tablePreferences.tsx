import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function canUseWebStorage(): boolean {
  return Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined';
}

async function readPreferencesStorage(key: string): Promise<string | null> {
  if (canUseWebStorage()) return globalThis.localStorage.getItem(key);
  return await SecureStore.getItemAsync(key);
}

async function writePreferencesStorage(key: string, value: string): Promise<void> {
  if (canUseWebStorage()) {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export type LiveDealerQuality = 'auto' | 'high' | 'balanced' | 'lite';

export interface TablePreferences {
  soundEffectsEnabled: boolean;
  hapticFeedbackEnabled: boolean;
  actionAlertsEnabled: boolean;
  liveDealerEnabled: boolean;
  liveDealerQuality: LiveDealerQuality;
  dealerVoiceEnabled: boolean;
  ambientEffectsEnabled: boolean;
  dealerSkinId: 'classic-casino-dealer' | 'luxury-tournament-dealer' | 'modern-professional-dealer' | 'vip-dealer';
}

interface TablePreferencesContextValue {
  preferences: TablePreferences;
  ready: boolean;
  setPreferences: (update: Partial<TablePreferences>) => void;
}

const TABLE_PREFERENCES_KEY = 'truestack.table.preferences';

const DEFAULT_PREFERENCES: TablePreferences = {
  soundEffectsEnabled: true,
  hapticFeedbackEnabled: true,
  actionAlertsEnabled: true,
  liveDealerEnabled: true,
  liveDealerQuality: 'auto',
  dealerVoiceEnabled: false,
  ambientEffectsEnabled: true,
  dealerSkinId: 'classic-casino-dealer',
};

const TablePreferencesContext = createContext<TablePreferencesContextValue | undefined>(undefined);

export function TablePreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] = useState<TablePreferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPreferences(): Promise<void> {
      try {
        const storedValue = await readPreferencesStorage(TABLE_PREFERENCES_KEY);
        if (!active || !storedValue) return;
        const parsed = JSON.parse(storedValue) as Partial<TablePreferences>;
        setPreferencesState((current) => ({ ...current, ...parsed }));
      } catch {
        // Fall back to defaults when storage is unavailable or corrupted.
      } finally {
        if (active) setReady(true);
      }
    }

    void loadPreferences();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    writePreferencesStorage(TABLE_PREFERENCES_KEY, JSON.stringify(preferences)).catch(() => {
      // Ignore storage failures; preferences remain in memory for this session.
    });
  }, [preferences, ready]);

  function setPreferences(update: Partial<TablePreferences>): void {
    setPreferencesState((current) => ({ ...current, ...update }));
  }

  return <TablePreferencesContext.Provider value={{ preferences, ready, setPreferences }}>{children}</TablePreferencesContext.Provider>;
}

export function useTablePreferences(): TablePreferencesContextValue {
  const value = useContext(TablePreferencesContext);
  if (!value) throw new Error('useTablePreferences must be used within TablePreferencesProvider');
  return value;
}
