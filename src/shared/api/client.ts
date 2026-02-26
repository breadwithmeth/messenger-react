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

  private async parseResponseBody(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 205) {
      return undefined;
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      return response.json().catch(() => undefined);
    }

    const text = await response.text().catch(() => '');
    return text || undefined;
  }

  private extractErrorMessage(payload: unknown): string {
    if (typeof payload === 'string' && payload.trim()) {
      return payload;
    }

    if (payload && typeof payload === 'object') {
      const maybeMessage = (payload as { message?: unknown }).message;
      if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
        return maybeMessage;
      }

      const maybeError = (payload as { error?: unknown }).error;
      if (typeof maybeError === 'string' && maybeError.trim()) {
        return maybeError;
      }

      const maybeDetail = (payload as { detail?: unknown }).detail;
      if (typeof maybeDetail === 'string' && maybeDetail.trim()) {
        return maybeDetail;
      }
    }

    return 'Request failed';
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const responseData = await this.parseResponseBody(response);

    if (!response.ok) {
      const errorData = responseData && typeof responseData === 'object'
        ? (responseData as Record<string, unknown>)
        : undefined;
      
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }

      throw new NetworkError(
        this.extractErrorMessage(responseData),
        response.status,
        errorData?.errors as Record<string, string[]> | undefined
      );
    }

    return responseData as T;
  }

  private async request<T>(endpoint: string, config: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);
      return this.handleResponse<T>(response);
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }

      throw new NetworkError(
        error instanceof Error ? error.message : 'Network request failed',
        0
      );
    }
  }

  async get<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;

    return this.request<T>(endpoint, {
      method: 'GET',
      headers: this.getHeaders(requiresAuth),
      ...restConfig,
    });
  }

  async post<T, D = unknown>(
    endpoint: string,
    data?: D,
    config: RequestConfig = {}
  ): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;

    return this.request<T>(endpoint, {
      method: 'POST',
      headers: this.getHeaders(requiresAuth),
      body: data ? JSON.stringify(data) : undefined,
      ...restConfig,
    });
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

    return this.request<T>(endpoint, {
      method: 'POST',
      headers,
      body: formData,
      ...restConfig,
    });
  }

  async put<T, D = unknown>(
    endpoint: string,
    data?: D,
    config: RequestConfig = {}
  ): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;

    return this.request<T>(endpoint, {
      method: 'PUT',
      headers: this.getHeaders(requiresAuth),
      body: data ? JSON.stringify(data) : undefined,
      ...restConfig,
    });
  }

  async delete<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const { requiresAuth = true, ...restConfig } = config;

    return this.request<T>(endpoint, {
      method: 'DELETE',
      headers: this.getHeaders(requiresAuth),
      ...restConfig,
    });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
