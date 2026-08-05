import { verifyPassword } from './password-service.js';
import { loadJsonFile, saveJsonFile } from './persistence.js';

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

  deleteUser(id: string): void {
    this.users.delete(id);
    this.passwordHashes.delete(id);
    this.persistUsers();
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
    const records = loadJsonFile<{ profile: UserProfile; passwordHash: string }[]>(this.options.storagePath);
    for (const entry of records ?? []) {
      this.users.set(entry.profile.id, entry.profile);
      this.passwordHashes.set(entry.profile.id, entry.passwordHash);
    }
  }

  private persistUsers(): void {
    const records = Array.from(this.users.values()).map((profile) => ({
      profile,
      passwordHash: this.passwordHashes.get(profile.id) ?? '',
    }));
    saveJsonFile(this.options.storagePath, records);
  }
}
