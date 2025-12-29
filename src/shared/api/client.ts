import { NetworkError } from './types';

const API_BASE_URL = 'https://bm.drawbridge.kz/api';

interface RequestConfig extends RequestInit {
  requiresAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getHeaders(requiresAuth: boolean): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth) {
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }

      throw new NetworkError(
        errorData.message || 'Request failed',
        response.status,
        errorData.errors
      );
    }

    return response.json();
  }

  async get<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(requiresAuth),
      ...restConfig,
    });

    return this.handleResponse<T>(response);
  }

  async post<T, D = unknown>(
    endpoint: string,
    data?: D,
    config: RequestConfig = {}
  ): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(requiresAuth),
      body: data ? JSON.stringify(data) : undefined,
      ...restConfig,
    });

    return this.handleResponse<T>(response);
  }

  async postFormData<T>(
    endpoint: string,
    formData: FormData,
    config: RequestConfig = {}
  ): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;
    const headers: HeadersInit = {};

    if (requiresAuth) {
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
      ...restConfig,
    });

    return this.handleResponse<T>(response);
  }

  async put<T, D = unknown>(
    endpoint: string,
    data?: D,
    config: RequestConfig = {}
  ): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(requiresAuth),
      body: data ? JSON.stringify(data) : undefined,
      ...restConfig,
    });

    return this.handleResponse<T>(response);
  }

  async delete<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(requiresAuth),
      ...restConfig,
    });

    return this.handleResponse<T>(response);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
