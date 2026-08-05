import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const AUTH_TOKEN_KEY = 'truestack.auth-token';

function canUseWebStorage(): boolean {
  return Platform.OS === 'web' && typeof globalThis.localStorage !== 'undefined';
}

export async function readStoredAuthToken(): Promise<string | null> {
  if (canUseWebStorage()) {
    return globalThis.localStorage.getItem(AUTH_TOKEN_KEY);
  }

  return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export async function writeStoredAuthToken(token: string): Promise<void> {
  if (canUseWebStorage()) {
    globalThis.localStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function clearStoredAuthToken(): Promise<void> {
  if (canUseWebStorage()) {
    globalThis.localStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}
