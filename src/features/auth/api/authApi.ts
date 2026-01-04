import { apiClient } from '@/shared/api/client';
import { AuthResponse, LoginCredentials } from '../model/types';

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse, LoginCredentials>(
      '/auth/login',
      credentials,
      { requiresAuth: false }
    );
  },

  getMe: async (): Promise<AuthResponse['user']> => {
    return apiClient.get<AuthResponse['user']>('/users/me');
  },

  register: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse, LoginCredentials>(
      '/auth/register',
      credentials,
      { requiresAuth: false }
    );
  },
};
