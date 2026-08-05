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

export class UserService {
  private readonly users = new Map<string, UserProfile>();

  createUser(id: string, username: string): UserProfile {
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
    return created;
  }

  getUser(id: string): UserProfile {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    return user;
  }

  addFriend(userId: string, friendId: string): UserProfile {
    const user = this.getUser(userId);
    if (user.friends.includes(friendId)) return user;
    const next = { ...user, friends: [...user.friends, friendId] };
    this.users.set(userId, next);
    return next;
  }

  incrementHandsPlayed(userId: string): UserProfile {
    const user = this.getUser(userId);
    const next = { ...user, handsPlayed: user.handsPlayed + 1 };
    this.users.set(userId, next);
    return next;
  }

  listUsers(): UserProfile[] {
    return Array.from(this.users.values());
  }
}
