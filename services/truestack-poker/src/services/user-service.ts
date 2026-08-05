import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { verifyPassword } from './password-service.js';

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl?: string;
  handsPlayed: number;
  winRate: number;
  tournamentResults: number;
  achievements: string[];
  friends: string[];
}

interface UserServiceOptions {
  storagePath?: string | null;
}

export class UserService {
  private readonly users = new Map<string, UserProfile>();
  private readonly passwordHashes = new Map<string, string>();

  constructor(private readonly options: UserServiceOptions = {}) {
    this.loadPersistedUsers();
  }

  createUser(id: string, username: string, passwordHash: string): UserProfile {
    const existing = this.users.get(id);
    if (existing) return existing;

    const created: UserProfile = {
      id,
      username,
      handsPlayed: 0,
      winRate: 0,
      tournamentResults: 0,
      achievements: [],
      friends: [],
    };
    this.users.set(id, created);
    this.passwordHashes.set(id, passwordHash);
    this.persistUsers();
    return created;
  }

  isUsernameTaken(username: string): boolean {
    return this.findByUsername(username) !== null;
  }

  verifyPassword(id: string, password: string): boolean {
    const hash = this.passwordHashes.get(id);
    if (!hash) return false;
    return verifyPassword(password, hash);
  }

  getUser(id: string): UserProfile {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    return user;
  }

  hasUser(id: string): boolean {
    return this.users.has(id);
  }

  findByUsername(username: string): UserProfile | null {
    const normalized = username.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.username.trim().toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  addFriend(userId: string, friendId: string): UserProfile {
    const user = this.getUser(userId);
    if (user.friends.includes(friendId)) return user;
    const next = { ...user, friends: [...user.friends, friendId] };
    this.users.set(userId, next);
    this.persistUsers();
    return next;
  }

  incrementHandsPlayed(userId: string): UserProfile {
    const user = this.getUser(userId);
    const next = { ...user, handsPlayed: user.handsPlayed + 1 };
    this.users.set(userId, next);
    this.persistUsers();
    return next;
  }

  listUsers(): UserProfile[] {
    return Array.from(this.users.values());
  }

  private loadPersistedUsers(): void {
    const storagePath = this.getStoragePath();
    if (!storagePath) return;

    try {
      const raw = readFileSync(storagePath, 'utf8');
      const parsed = JSON.parse(raw) as { profile: UserProfile; passwordHash: string }[];
      for (const entry of parsed) {
        this.users.set(entry.profile.id, entry.profile);
        this.passwordHashes.set(entry.profile.id, entry.passwordHash);
      }
    } catch {
      // Missing or invalid storage should not block startup.
    }
  }

  private persistUsers(): void {
    const storagePath = this.getStoragePath();
    if (!storagePath) return;

    const records = Array.from(this.users.values()).map((profile) => ({
      profile,
      passwordHash: this.passwordHashes.get(profile.id) ?? '',
    }));

    mkdirSync(dirname(storagePath), { recursive: true });
    writeFileSync(storagePath, JSON.stringify(records, null, 2), 'utf8');
  }

  private getStoragePath(): string | null {
    if (this.options.storagePath === null) return null;
    return this.options.storagePath ?? resolve(process.cwd(), 'data/runtime/users.json');
  }
}
