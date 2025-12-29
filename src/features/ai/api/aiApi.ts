import { NetworkError } from '@/shared/api/types';

export interface AiSuggestionsResponse {
  success: boolean;
  chatId: number;
  suggestions: string[];
  count: number;
}

const getAiBaseUrl = () => {
  const fromEnv = (import.meta.env as unknown as { VITE_AI_API_BASE_URL?: string }).VITE_AI_API_BASE_URL;
  return (fromEnv && fromEnv.trim()) || 'https://bm.drawbridge.kz';
};

export const aiApi = {
  getSuggestions: async (chatId: number, limit = 3): Promise<AiSuggestionsResponse> => {
    const token = localStorage.getItem('auth_token');

    const url = new URL(`/api/ai/suggestions/${chatId}`, getAiBaseUrl());
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({} as { message?: string }));
      throw new NetworkError(errorData?.message || 'Не удалось получить подсказки', res.status);
    }

    return res.json();
  },
};
