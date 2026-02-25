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

  translateText: async (text: string, targetLang = 'ru', sourceLang = 'auto'): Promise<string> => {
    const cleanText = text.trim();
    if (!cleanText) return '';

    const token = localStorage.getItem('auth_token');
    const base = getAiBaseUrl();

    const aiEndpoints = ['/api/ai/translate', '/api/ai/translate-text'];

    for (const endpoint of aiEndpoints) {
      try {
        const url = new URL(endpoint, base);
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ text: cleanText, targetLang, sourceLang }),
        });

        if (!res.ok) continue;

        const data = (await res.json().catch(() => ({}))) as AiTranslateResponse;
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
