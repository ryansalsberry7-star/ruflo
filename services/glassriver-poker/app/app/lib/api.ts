import { Platform } from 'react-native';

function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4040';
  }

  return 'http://127.0.0.1:4040';
}

const API_BASE_URL = resolveApiBaseUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Request failed (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

export function getJson<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export { API_BASE_URL };
