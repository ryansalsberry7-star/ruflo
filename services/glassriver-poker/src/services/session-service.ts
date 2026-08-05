import { randomBytes } from 'node:crypto';

export interface ReconnectSession {
  token: string;
  userId: string;
  tableId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthSession {
  token: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
}

export class SessionService {
  private readonly reconnectSessions = new Map<string, ReconnectSession>();
  private readonly authSessions = new Map<string, AuthSession>();

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

    this.reconnectSessions.set(token, session);
    return session;
  }

  issueAuthToken(userId: string, ttlMs = 1000 * 60 * 60 * 24 * 30): AuthSession {
    const token = randomBytes(24).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ttlMs;

    const session: AuthSession = {
      token,
      userId,
      issuedAt,
      expiresAt,
    };

    this.authSessions.set(token, session);
    return session;
  }

  consumeReconnectToken(token: string): ReconnectSession {
    const session = this.reconnectSessions.get(token);
    if (!session) throw new Error('Reconnect token is invalid.');
    if (Date.now() > session.expiresAt) {
      this.reconnectSessions.delete(token);
      throw new Error('Reconnect token has expired.');
    }

    this.reconnectSessions.delete(token);
    return session;
  }

  peekReconnectToken(token: string): ReconnectSession | null {
    const session = this.reconnectSessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.reconnectSessions.delete(token);
      return null;
    }
    return session;
  }

  resolveAuthToken(token: string): AuthSession | null {
    const session = this.authSessions.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.authSessions.delete(token);
      return null;
    }
    return session;
  }

  revokeAuthToken(token: string): void {
    this.authSessions.delete(token);
  }
}
