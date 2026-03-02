import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { KeycloakTokenParsed } from 'keycloak-js';
import { initKeycloak, keycloak, KEYCLOAK_REDIRECT_URI, KEYCLOAK_SCOPE } from './keycloak';

type TokenWithRoles = KeycloakTokenParsed & {
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  sub?: string;
  realm_access?: {
    roles?: string[];
  };
  resource_access?: Record<string, { roles?: string[] }>;
  id?: number | string;
  user_id?: number | string;
  operator_id?: number | string;
};

export type AuthUser = {
  id: number;
  sub: string;
  email: string;
  username: string;
  displayName: string;
};

export type AuthContextValue = {
  user: AuthUser | null;
  roles: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const getFrontendOrigin = () => {
  const envOrigin = import.meta.env.VITE_FRONTEND_ORIGIN;
  if (envOrigin) {
    return envOrigin;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return 'https://messenger.naliv.kz';
};

const FRONTEND_ORIGIN = getFrontendOrigin();
const LOGOUT_REDIRECT_URI = import.meta.env.VITE_LOGOUT_REDIRECT_URI ?? `${FRONTEND_ORIGIN.replace(/\/+$/, '')}/`;

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
};

const buildUser = (parsed: TokenWithRoles | undefined): AuthUser | null => {
  if (!parsed) return null;

  const sub = parsed.sub ?? '';
  const email = parsed.email ?? '';
  const username = parsed.preferred_username ?? email ?? sub;
  const displayName = parsed.name ?? ([parsed.given_name, parsed.family_name].filter(Boolean).join(' ') || username);
  const id = toNumber(parsed.operator_id ?? parsed.user_id ?? parsed.id ?? sub);

  return {
    id,
    sub,
    email,
    username,
    displayName,
  };
};

const extractRealmRoles = (parsed: TokenWithRoles | undefined): string[] => {
  if (!parsed?.realm_access?.roles) return [];
  return parsed.realm_access.roles.filter((role): role is string => typeof role === 'string');
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const refreshIntervalRef = useRef<number | null>(null);

  const syncFromToken = useCallback(() => {
    const parsed = keycloak.tokenParsed as TokenWithRoles | undefined;
    setUser(buildUser(parsed));
    setRoles(extractRealmRoles(parsed));
    setIsAuthenticated(Boolean(keycloak.authenticated));
  }, []);

  const login = useCallback(async () => {
    await keycloak.login({
      redirectUri: KEYCLOAK_REDIRECT_URI,
      scope: KEYCLOAK_SCOPE,
    });
  }, []);

  const logout = useCallback(async () => {
    if (refreshIntervalRef.current !== null) {
      window.clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    await keycloak.logout({
      redirectUri: LOGOUT_REDIRECT_URI,
    });
  }, []);

  const getAccessToken = useCallback(() => keycloak.token ?? null, []);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        const authenticated = await initKeycloak();

        if (!mounted) return;

        if (!authenticated) {
          await login();
          return;
        }

        syncFromToken();

        keycloak.onAuthSuccess = syncFromToken;
        keycloak.onAuthRefreshSuccess = syncFromToken;
        keycloak.onAuthLogout = () => {
          if (!mounted) return;
          setUser(null);
          setRoles([]);
          setIsAuthenticated(false);
        };

        keycloak.onTokenExpired = () => {
          void keycloak.updateToken(60).catch(() => {
            void logout();
          });
        };

        refreshIntervalRef.current = window.setInterval(() => {
          void keycloak.updateToken(60).catch(() => {
            void logout();
          });
        }, 30000);
      } catch {
        if (!mounted) return;
        setUser(null);
        setRoles([]);
        setIsAuthenticated(false);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void boot();

    return () => {
      mounted = false;
      if (refreshIntervalRef.current !== null) {
        window.clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [login, logout, syncFromToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      roles,
      isAuthenticated,
      isLoading,
      login,
      logout,
      getAccessToken,
    }),
    [getAccessToken, isAuthenticated, isLoading, login, logout, roles, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
