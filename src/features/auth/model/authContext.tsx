import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthContextValue, User, LoginCredentials } from './types';
import { authApi } from '../api/authApi';

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_TOKEN_KEY = 'auth_token';
const USER_KEY = 'user';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);

    if (!token) {
      setIsLoading(false);
      return;
    }

    // Быстрый кэш, чтобы UI не мерцал, пока тянем /users/me
    if (userStr) {
      try {
        const userData = JSON.parse(userStr) as User;
        setUser(userData);
      } catch {
        localStorage.removeItem(USER_KEY);
      }
    }

    void (async () => {
      try {
        const me = await authApi.getMe();
        setUser(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    const response = await authApi.login(credentials);
    
    localStorage.setItem(AUTH_TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    
    setUser(response.user);
  };

  const logout = (): void => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  return context;
}
