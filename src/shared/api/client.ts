import axios, { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { apiAxios } from '@/api/axios';
import { NetworkError } from './types';

interface RequestConfig extends AxiosRequestConfig {
  requiresAuth?: boolean;
}

class ApiClient {
  private normalizeEndpoint(endpoint: string): string {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }

    const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    if (normalized.startsWith('/api/')) {
      return normalized;
    }

    return `/api${normalized}`;
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

  private async request<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    const { requiresAuth = true, headers, ...restConfig } = config;
    const normalizedEndpoint = this.normalizeEndpoint(endpoint);

    try {
      const response = await apiAxios.request<T, AxiosResponse<T>>({
        url: normalizedEndpoint,
        headers,
        skipAuth: !requiresAuth,
        ...restConfig,
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const payload = axiosError.response?.data;
        const status = axiosError.response?.status ?? 0;
        const errorData = payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : undefined;

        throw new NetworkError(
          this.extractErrorMessage(payload),
          status,
          errorData?.errors as Record<string, string[]> | undefined
        );
      }

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
    return this.request<T>(endpoint, {
      method: 'GET',
      ...config,
    });
  }

  async post<T, D = unknown>(
    endpoint: string,
    data?: D,
    config: RequestConfig = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      data,
      ...config,
    });
  }

  async postFormData<T>(
    endpoint: string,
    formData: FormData,
    config: RequestConfig = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      data: formData,
      headers: {
        ...(config.headers ?? {}),
      },
      ...config,
    });
  }

  async put<T, D = unknown>(
    endpoint: string,
    data?: D,
    config: RequestConfig = {}
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      data,
      ...config,
    });
  }

  async delete<T>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      ...config,
    });
  }
}

export const apiClient = new ApiClient();
