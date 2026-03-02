import { apiClient } from '@/shared/api/client';
import { NetworkError } from '@/shared/api/types';

export interface AiSuggestionsResponse {
  success: boolean;
  chatId: number;
  suggestions: string[];
  count: number;
}

type AiTranslateResponse = {
  success?: boolean;
  translatedText?: string;
  translation?: string;
  text?: string;
};

export const aiApi = {
  getSuggestions: async (chatId: number, limit = 3): Promise<AiSuggestionsResponse> => {
    const query = new URLSearchParams();
    query.set('limit', String(limit));
    return apiClient.get<AiSuggestionsResponse>(`/ai/suggestions/${chatId}?${query.toString()}`);
  },

  translateText: async (text: string, targetLang = 'ru', sourceLang = 'auto'): Promise<string> => {
    const cleanText = text.trim();
    if (!cleanText) return '';

    const aiEndpoints = ['/ai/translate', '/ai/translate-text'];

    for (const endpoint of aiEndpoints) {
      try {
        const data = await apiClient.post<AiTranslateResponse, {
          text: string;
          targetLang: string;
          sourceLang: string;
        }>(endpoint, {
          text: cleanText,
          targetLang,
          sourceLang,
        });

        const translated = (data.translatedText || data.translation || data.text || '').trim();
        if (translated) return translated;
      } catch {
        // try next endpoint/fallback
      }
    }

    try {
      const url = new URL('https://translate.googleapis.com/translate_a/single');
      url.searchParams.set('client', 'gtx');
      url.searchParams.set('sl', sourceLang || 'auto');
      url.searchParams.set('tl', targetLang || 'ru');
      url.searchParams.set('dt', 't');
      url.searchParams.set('q', cleanText);

      const res = await fetch(url.toString(), { method: 'GET' });
      if (!res.ok) {
        throw new NetworkError('Не удалось перевести сообщение', res.status);
      }

      const payload = (await res.json()) as unknown;
      const chunks = Array.isArray(payload) ? payload[0] : [];
      const translated = Array.isArray(chunks)
        ? chunks
            .map((chunk) => (Array.isArray(chunk) && typeof chunk[0] === 'string' ? chunk[0] : ''))
            .join('')
            .trim()
        : '';

      if (!translated) throw new NetworkError('Пустой ответ перевода', 502);
      return translated;
    } catch (err) {
      if (err instanceof NetworkError) throw err;
      throw new NetworkError('Не удалось перевести сообщение', 500);
    }
  },
};
