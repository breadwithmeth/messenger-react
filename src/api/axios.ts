import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { initKeycloak, keycloak } from '@/auth/keycloak';

declare module 'axios' {
  interface AxiosRequestConfig {
    _retry?: boolean;
    skipAuth?: boolean;
  }

  interface InternalAxiosRequestConfig {
    _retry?: boolean;
    skipAuth?: boolean;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not configured');
}

const FRONTEND_ORIGIN =
  import.meta.env.VITE_FRONTEND_ORIGIN ??
  (typeof window !== 'undefined' ? window.location.origin : 'https://messenger.naliv.kz');
const LOGOUT_REDIRECT_URI = import.meta.env.VITE_LOGOUT_REDIRECT_URI ?? FRONTEND_ORIGIN;

const apiAxios = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '='));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
};

apiAxios.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (config.skipAuth) {
    return config;
  }

  await initKeycloak();

  if (!keycloak.authenticated) {
    throw new Error('Keycloak session is not authenticated');
  }

  await keycloak.updateToken(30);

  const token = keycloak.authenticated ? keycloak.token : undefined;
  if (!token) {
    throw new Error('Keycloak access token is missing for authenticated request');
  }

  config.headers = config.headers ?? {};
  config.headers.Authorization = `Bearer ${token}`;

  return config;
});

apiAxios.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.skipAuth
    ) {
      if (import.meta.env.DEV) {
        const token = keycloak.token;
        const payload = token ? decodeJwtPayload(token) : null;
        console.warn('[BM 401] JWT diagnostics', {
          hasToken: Boolean(token),
          iss: payload?.iss,
          aud: payload?.aud,
          azp: payload?.azp,
          exp: payload?.exp,
          now: Math.floor(Date.now() / 1000),
          url: originalRequest.url,
        });
      }

      originalRequest._retry = true;

      try {
        await initKeycloak();

        if (!keycloak.authenticated) {
          throw new Error('Not authenticated in Keycloak session');
        }

        await keycloak.updateToken(0);

        const token = keycloak.authenticated ? keycloak.token : undefined;
        if (!token) {
          throw new Error('Keycloak access token is missing after refresh');
        }

        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${token}`;

        return apiAxios.request(originalRequest);
      } catch {
        await keycloak.logout({
          redirectUri: LOGOUT_REDIRECT_URI,
        });
      }
    }

    return Promise.reject(error);
  }
);

export { apiAxios };
