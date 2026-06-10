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
import { authApi } from '@/features/auth/api/authApi';
import type { User as ApiUser } from '@/features/auth/model/types';
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
  role?: string;
  isHr?: boolean | string | number;
  is_hr?: boolean | string | number;
};

export type AuthUser = {
  id: number;
  sub: string;
  email: string;
  username: string;
  displayName: string;
  role?: string;
  isHr: boolean;
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

const toBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
  return false;
};

const buildUser = (parsed: TokenWithRoles | undefined): AuthUser | null => {
  if (!parsed) return null;

  const sub = parsed.sub ?? '';
  const email = parsed.email ?? '';
  const username = parsed.preferred_username ?? email ?? sub;
  const displayName = parsed.name ?? ([parsed.given_name, parsed.family_name].filter(Boolean).join(' ') || username);
  const id = toNumber(parsed.operator_id ?? parsed.user_id ?? parsed.id ?? sub);
  const role = typeof parsed.role === 'string' ? parsed.role : undefined;
  const isHr = toBoolean(parsed.isHr ?? parsed.is_hr);

  return {
    id,
    sub,
    email,
    username,
    displayName,
    role,
    isHr,
  };
};

const mergeApiUser = (base: AuthUser | null, apiUser: ApiUser): AuthUser => {
  const email = apiUser.email || base?.email || '';
  const displayName = apiUser.name?.trim() || base?.displayName || email || base?.username || '';

  return {
    id: toNumber(apiUser.id) || base?.id || 0,
    sub: base?.sub || '',
    email,
    username: base?.username || email,
    displayName,
    role: apiUser.role ?? base?.role,
    isHr: apiUser.isHr === true,
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

  const refreshUserFromApi = useCallback(async () => {
    try {
      const apiUser = await authApi.getMe();
      setUser((current) => mergeApiUser(current ?? buildUser(keycloak.tokenParsed as TokenWithRoles | undefined), apiUser));
    } catch {
      // Keep token-derived user data if the profile endpoint is unavailable.
    }
  }, []);

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
        void refreshUserFromApi();

        keycloak.onAuthSuccess = () => {
          syncFromToken();
          void refreshUserFromApi();
        };
        keycloak.onAuthRefreshSuccess = () => {
          syncFromToken();
          void refreshUserFromApi();
        };
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
  }, [login, logout, refreshUserFromApi, syncFromToken]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const handleFocus = () => {
      void refreshUserFromApi();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isAuthenticated, refreshUserFromApi]);

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
