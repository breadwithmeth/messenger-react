import { apiClient } from '@/shared/api/client';
import { NetworkError } from '@/shared/api/types';
import { ClientComment, ClientCommentsResponse } from '../model/types';

const parseChatId = (rawId: number | string): number => {
  const id = typeof rawId === 'string' ? Number(rawId) : rawId;
  if (!Number.isFinite(id) || id <= 0) {
    throw new NetworkError('Invalid chat id', 400);
  }
  return id;
};

const normalizeContent = (text: string): string => {
  const trimmed = text?.trim();
  if (!trimmed) {
    throw new NetworkError('Content is required', 400);
  }
  return trimmed;
};

const normalizeLimit = (rawLimit?: number): number | undefined => {
  if (rawLimit === undefined) return undefined;
  const limit = Number(rawLimit);
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    throw new NetworkError('Invalid limit', 400);
  }
  return limit;
};

const normalizeOffset = (rawOffset?: number): number | undefined => {
  if (rawOffset === undefined) return undefined;
  const offset = Number(rawOffset);
  if (!Number.isFinite(offset) || offset < 0) {
    throw new NetworkError('Invalid offset', 400);
  }
  return offset;
};

export const clientsApi = {
  async getComments(chatId: number | string, params?: { limit?: number; offset?: number }): Promise<ClientCommentsResponse> {
    const id = parseChatId(chatId);
    const query = new URLSearchParams();
    const limit = normalizeLimit(params?.limit);
    const offset = normalizeOffset(params?.offset);
    if (limit !== undefined) query.append('limit', String(limit));
    if (offset !== undefined) query.append('offset', String(offset));

    return apiClient.get<ClientCommentsResponse>(
      `/chats/${id}/comments${query.toString() ? `?${query.toString()}` : ''}`
    );
  },

  async addComment(chatId: number | string, content: string): Promise<ClientComment> {
    const id = parseChatId(chatId);
    const normalizedContent = normalizeContent(content);

    return apiClient.post<ClientComment, { content: string }>(
      `/chats/${id}/comments`,
      { content: normalizedContent }
    );
  },
};
