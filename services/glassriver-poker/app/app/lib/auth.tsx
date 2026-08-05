import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getJson, postJson } from './api';
import { clearStoredAuthToken, readStoredAuthToken, writeStoredAuthToken } from './secure-session';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  trust: {
    trustScore: number;
    verifiedHuman: boolean;
  };
}

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  error: string | null;
  login: (input: { userId?: string; username?: string }) => Promise<void>;
  register: (input: { userId?: string; username: string }) => Promise<void>;
  logout: () => Promise<void>;
}

interface AuthSessionResponse {
  session: AuthenticatedUser;
  authToken: string;
  authTokenExpiresAt: number;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap(): Promise<void> {
      try {
        const storedToken = await readStoredAuthToken();
        const response = await getJson<AuthSessionResponse>('/api/auth/session', {
          headers: storedToken ? { authorization: `Bearer ${storedToken}` } : undefined,
        });
        if (!active) return;
        setUser(response.session);
        setAuthToken(response.authToken);
        await writeStoredAuthToken(response.authToken);
      } catch (bootstrapError) {
        if (!active) return;
        setError(bootstrapError instanceof Error ? bootstrapError.message : 'Failed to load session.');
        await clearStoredAuthToken();
      } finally {
        if (active) setLoading(false);
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  async function login(input: { userId?: string; username?: string }): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await postJson<AuthSessionResponse>('/api/auth/login', input);
      setUser(response.session);
      setAuthToken(response.authToken);
      await writeStoredAuthToken(response.authToken);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed.');
      throw loginError;
    } finally {
      setLoading(false);
    }
  }

  async function register(input: { userId?: string; username: string }): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await postJson<AuthSessionResponse>('/api/auth/register', input);
      setUser(response.session);
      setAuthToken(response.authToken);
      await writeStoredAuthToken(response.authToken);
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'Registration failed.');
      throw registerError;
    } finally {
      setLoading(false);
    }
  }

  async function logout(): Promise<void> {
    if (authToken) {
      try {
        await postJson('/api/auth/logout', {}, { headers: { authorization: `Bearer ${authToken}` } });
      } catch {
        // Clear local state even if remote revocation fails.
      }
    }

    await clearStoredAuthToken();
    setAuthToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, error, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}