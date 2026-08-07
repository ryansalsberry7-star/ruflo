import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getJson, postJson } from './api';
import { clearStoredAuthToken, readStoredAuthToken, writeStoredAuthToken } from './secure-session';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  playerCharacter: string;
  trust: {
    trustScore: number;
    verifiedHuman: boolean;
  };
}

interface AuthContextValue {
  user: AuthenticatedUser | null;
  authToken: string | null;
  loading: boolean;
  error: string | null;
  login: (input: { userId?: string; username?: string; password: string }) => Promise<void>;
  register: (input: { userId?: string; username: string; password: string; playerCharacter?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

interface AuthSessionResponse {
  session: AuthenticatedUser | null;
  authToken: string | null;
  authTokenExpiresAt: number | null;
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
        if (response.authToken) {
          await writeStoredAuthToken(response.authToken);
        } else {
          await clearStoredAuthToken();
        }
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

  async function login(input: { userId?: string; username?: string; password: string }): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await postJson<AuthSessionResponse>('/api/auth/login', input);
      setUser(response.session);
      setAuthToken(response.authToken);
      if (response.authToken) {
        await writeStoredAuthToken(response.authToken);
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed.');
      throw loginError;
    } finally {
      setLoading(false);
    }
  }

  async function register(input: { userId?: string; username: string; password: string; playerCharacter?: string }): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await postJson<AuthSessionResponse>('/api/auth/register', input);
      setUser(response.session);
      setAuthToken(response.authToken);
      if (response.authToken) {
        await writeStoredAuthToken(response.authToken);
      }
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

  return <AuthContext.Provider value={{ user, authToken, loading, error, login, register, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
