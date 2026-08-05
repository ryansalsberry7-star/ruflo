import { randomBytes } from 'node:crypto';

export interface ReconnectSession {
  token: string;
  userId: string;
  tableId: string;
  issuedAt: number;
  expiresAt: number;
}

export class SessionService {
  private readonly sessions = new Map<string, ReconnectSession>();

  issueReconnectToken(userId: string, tableId: string, ttlMs = 1000 * 60 * 30): ReconnectSession {
    const token = randomBytes(24).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ttlMs;

    const session: ReconnectSession = {
      token,
      userId,
      tableId,
      issuedAt,
      expiresAt,
    };

    this.sessions.set(token, session);
    return session;
  }

  consumeReconnectToken(token: string): ReconnectSession {
    const session = this.sessions.get(token);
    if (!session) throw new Error('Reconnect token is invalid.');
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      throw new Error('Reconnect token has expired.');
    }

    this.sessions.delete(token);
    return session;
  }

  peekReconnectToken(token: string): ReconnectSession | null {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }
}
