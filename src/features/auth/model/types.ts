export interface User {
  id: number;
  email: string;
  name?: string;
  role?: string;
  isHr: boolean;
  organizationId?: number;
  createdAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}
