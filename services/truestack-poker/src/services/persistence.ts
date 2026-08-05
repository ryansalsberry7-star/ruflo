import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function loadJsonFile<T>(path: string | null | undefined): T | null {
  if (!path) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function saveJsonFile(path: string | null | undefined, data: unknown): void {
  if (!path) return;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}
