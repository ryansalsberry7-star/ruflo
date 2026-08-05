import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, derivedHex] = storedHash.split(':');
  if (!salt || !derivedHex) return false;

  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const stored = Buffer.from(derivedHex, 'hex');
  if (candidate.length !== stored.length) return false;

  return timingSafeEqual(candidate, stored);
}

export function isPasswordStrongEnough(password: string): boolean {
  return typeof password === 'string' && password.trim().length >= MIN_PASSWORD_LENGTH;
}

export { MIN_PASSWORD_LENGTH };
