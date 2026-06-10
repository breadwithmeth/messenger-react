import { apiClient } from '@/shared/api/client';
import { ChatsResponse, Chat, MessagesResponse, ChatPriority, Message } from '../model/types';

type MediaType = 'image' | 'document' | 'video' | 'audio';

interface UploadForWabaResponse {
  success: boolean;
  mediaUrl: string;
  fileName: string;
  mediaType: MediaType;
  size: number;
  mimeType: string;
  metadata?: {
    originalName?: string;
    uploadedAt?: string;
    organizationId?: number;
  };
}

type AssignmentPriority = ChatPriority;

interface ChatAssignmentResponse {
  success: boolean;
  chat: Chat;
  message?: string;
}

interface ChatHrResponse {
  success: boolean;
  chat: Chat;
  history?: Record<string, unknown>;
}

const parseNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeMessagesResponse = (
  payload: unknown,
  limitFallback: number,
  offsetFallback: number
): MessagesResponse => {
  const source = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  const rawMessages =
    source.messages ??
    source.messeges ??
    source.items ??
    ((source.data as Record<string, unknown> | undefined)?.messages ??
      (source.data as Record<string, unknown> | undefined)?.messeges) ??
    [];

  const messages = Array.isArray(rawMessages) ? (rawMessages as Message[]) : [];

  const rawPagination =
    source.pagination ??
    source.meta ??
    source.pageInfo ??
    (source.data as Record<string, unknown> | undefined)?.pagination;

  const paginationSource =
    rawPagination && typeof rawPagination === 'object'
      ? (rawPagination as Record<string, unknown>)
      : {};

  const total = parseNumber(paginationSource.total, messages.length);
  const limit = parseNumber(paginationSource.limit, limitFallback);
  const offset = parseNumber(paginationSource.offset, offsetFallback);
  const hasMoreFromApi = paginationSource.hasMore;
  const hasMore =
    typeof hasMoreFromApi === 'boolean' ? hasMoreFromApi : offset + limit < total;

  return {
    chat:
      source.chat && typeof source.chat === 'object'
        ? (source.chat as MessagesResponse['chat'])
        : undefined,
    messages,
    pagination: {
      total,
      limit,
      offset,
      hasMore,
      oldestTimestamp:
        typeof paginationSource.oldestTimestamp === 'string' ? paginationSource.oldestTimestamp : '',
      newestTimestamp:
        typeof paginationSource.newestTimestamp === 'string' ? paginationSource.newestTimestamp : '',
    },
  };
};

export const chatsApi = {
  getChats: async (params?: {
    status?: 'open' | 'closed' | string;
    assignedToMe?: boolean;
    assignedUserId?: number;
    priority?: ChatPriority;
    channel?: 'whatsapp' | 'telegram';
    includeProfile?: boolean;
    search?: string;
    searchType?: 'message' | 'phone' | 'all';
    sortBy?: 'lastMessageAt' | 'createdAt' | 'priority' | 'unreadCount' | 'status' | 'name';
    sortOrder?: 'asc' | 'desc';
    isHr?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ChatsResponse> => {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.assignedToMe !== undefined) query.append('assignedToMe', params.assignedToMe.toString());
    if (params?.assignedUserId !== undefined) query.append('assignedUserId', params.assignedUserId.toString());
    if (params?.priority) query.append('priority', params.priority);
    if (params?.channel) query.append('channel', params.channel);
    if (params?.includeProfile) query.append('includeProfile', 'true');
    if (params?.search) query.append('search', params.search);
    if (params?.searchType) query.append('searchType', params.searchType);
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    if (params?.sortOrder) query.append('sortOrder', params.sortOrder);
    if (params?.isHr !== undefined) query.append('isHr', params.isHr.toString());
    if (params?.limit !== undefined) query.append('limit', params.limit.toString());
    if (params?.offset !== undefined) query.append('offset', params.offset.toString());
    
    const queryString = query.toString();
    return apiClient.get<ChatsResponse>(
      `/chats${queryString ? `?${queryString}` : ''}`
    );
  },

  getChat: async (id: number): Promise<Chat> => {
    return apiClient.get<Chat>(`/chats/${id}`);
  },

  setChatHr: async (chatId: number, isHr: boolean): Promise<ChatHrResponse> => {
    return apiClient.patch<ChatHrResponse, { isHr: boolean }>(`/chats/${chatId}/hr`, { isHr });
  },

  getMessages: async (chatId: number, params?: {
    limit?: number;
    offset?: number;
  }): Promise<MessagesResponse> => {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.append('limit', params.limit.toString());
    if (params?.offset !== undefined) query.append('offset', params.offset.toString());
    
    const queryString = query.toString();
    const response = await apiClient.get<unknown>(
      `/chats/${chatId}/messages${queryString ? `?${queryString}` : ''}`
    );

    return normalizeMessagesResponse(response, params?.limit ?? 50, params?.offset ?? 0);
  },

  sendMessage: async (chatId: number, text: string): Promise<unknown> => {
    return apiClient.post<unknown, { chatId: number; type: 'text'; text: string }>(
      `/messages/send-by-chat`,
      { chatId, type: 'text', text }
    );
  },

  sendHrOutreach: async (phone: string): Promise<unknown> => {
    return apiClient.post<unknown, {
      organizationPhoneId: number;
      recipients: string[];
      templateName: string;
      language: string;
      components: { type: string; parameters: unknown[] }[];
      delayMs: number;
      dryRun: boolean;
    }>(
      `https://bm.drawbridge.kz/api/waba/broadcast-template`,
      {
        organizationPhoneId: 8,
        recipients: [phone],
        templateName: 'hr_outreach',
        language: 'ru',
        components: [{ type: 'body', parameters: [] }],
        delayMs: 250,
        dryRun: false,
      }
    );
  },

  uploadMediaForWaba: async (file: File, mediaType: MediaType): Promise<UploadForWabaResponse> => {
    const formData = new FormData();
    formData.append('media', file);
    formData.append('mediaType', mediaType);
    return apiClient.postFormData<UploadForWabaResponse>(`/media/upload-for-waba`, formData);
  },

  sendMediaMessage: async (params: {
    chatId: number;
    type: MediaType;
    mediaUrl: string;
    caption?: string;
    filename?: string;
  }): Promise<unknown> => {
    return apiClient.post<unknown, {
      chatId: number;
      type: MediaType;
      mediaUrl: string;
      caption?: string;
      filename?: string;
    }>(`/messages/send-by-chat`, params);
  },

  assignChat: async (params: { chatId: number; operatorId: number; priority?: AssignmentPriority }): Promise<ChatAssignmentResponse> => {
    return apiClient.post<ChatAssignmentResponse, { chatId: number; operatorId: number; priority?: AssignmentPriority }>(
      `/chat-assignment/assign`,
      params
    );
  },

  setChatPriority: async (params: { chatId: number; priority: ChatPriority }): Promise<ChatAssignmentResponse> => {
    return apiClient.post<ChatAssignmentResponse, { chatId: number; priority: ChatPriority }>(
      `/chat-assignment/priority`,
      params
    );
  },

  unassignChat: async (params: { chatId: number }): Promise<ChatAssignmentResponse> => {
    return apiClient.post<ChatAssignmentResponse, { chatId: number }>(`/chat-assignment/unassign`, params);
  },

  markChatRead: async (chatId: number): Promise<unknown> => {
    return apiClient.post<unknown>(`/unread/${chatId}/mark-chat-read`);
  },

  deleteChat: async (id: number): Promise<void> => {
    return apiClient.delete<void>(`/chats/${id}`);
  },
};
