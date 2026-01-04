import { apiClient } from '@/shared/api/client';
import { ChatsResponse, Chat, MessagesResponse } from '../model/types';

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

type AssignmentPriority = 'low' | 'normal' | 'high' | 'urgent';

interface ChatAssignmentResponse {
  success: boolean;
  chat: Chat;
  message?: string;
}

export const chatsApi = {
  getChats: async (params?: {
    includeProfile?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    assignedToMe?: boolean;
  }): Promise<ChatsResponse> => {
    const query = new URLSearchParams();
    if (params?.includeProfile) query.append('includeProfile', 'true');
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    if (params?.sortOrder) query.append('sortOrder', params.sortOrder);
    if (params?.limit !== undefined) query.append('limit', params.limit.toString());
    if (params?.offset !== undefined) query.append('offset', params.offset.toString());
    if (params?.assignedToMe) query.append('assignedToMe', 'true');
    
    const queryString = query.toString();
    return apiClient.get<ChatsResponse>(
      `/chats${queryString ? `?${queryString}` : ''}`
    );
  },

  getChat: async (id: number): Promise<Chat> => {
    return apiClient.get<Chat>(`/chats/${id}`);
  },

  getMessages: async (chatId: number, params?: {
    limit?: number;
    offset?: number;
  }): Promise<MessagesResponse> => {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) query.append('limit', params.limit.toString());
    if (params?.offset !== undefined) query.append('offset', params.offset.toString());
    
    const queryString = query.toString();
    return apiClient.get<MessagesResponse>(
      `/chats/${chatId}/messages${queryString ? `?${queryString}` : ''}`
    );
  },

  sendMessage: async (chatId: number, text: string): Promise<unknown> => {
    return apiClient.post<unknown, { chatId: number; type: 'text'; text: string }>(
      `/messages/send-by-chat`,
      { chatId, type: 'text', text }
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
