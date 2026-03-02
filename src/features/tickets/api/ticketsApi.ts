import { apiClient } from '@/shared/api/client';
import type {
  AssignTicketResponse,
  Ticket,
  TicketHistoryResponse,
  TicketMessagesResponse,
  TicketPriority,
  TicketQueryParams,
  TicketStats,
  TicketStatus,
  TicketsListResponse,
} from '../model/types';

const buildQuery = (params?: TicketQueryParams) => {
  const query = new URLSearchParams();

  if (!params) return '';

  if (params.status) query.append('status', params.status);
  if (params.priority) query.append('priority', params.priority);
  if (typeof params.assignedUserId === 'number') query.append('assignedUserId', String(params.assignedUserId));
  if (params.category) query.append('category', params.category);
  if (typeof params.page === 'number') query.append('page', String(params.page));
  if (typeof params.limit === 'number') query.append('limit', String(params.limit));
  if (params.sortBy) query.append('sortBy', params.sortBy);
  if (params.sortOrder) query.append('sortOrder', params.sortOrder);

  return query.toString();
};

export const ticketsApi = {
  getStats: async (): Promise<TicketStats> => {
    return apiClient.get<TicketStats>('/tickets/stats');
  },

  getTickets: async (params?: TicketQueryParams): Promise<TicketsListResponse> => {
    const query = buildQuery(params);
    return apiClient.get<TicketsListResponse>(`/tickets${query ? `?${query}` : ''}`);
  },

  getTicket: async (ticketNumber: string): Promise<Ticket> => {
    return apiClient.get<Ticket>(`/tickets/${ticketNumber}`);
  },

  getTicketMessages: async (ticketNumber: string): Promise<TicketMessagesResponse> => {
    return apiClient.get<TicketMessagesResponse>(`/tickets/${ticketNumber}/messages`);
  },

  assignTicket: async (ticketNumber: string, userId: number): Promise<AssignTicketResponse> => {
    return apiClient.post<AssignTicketResponse, { userId: number }>(`/tickets/${ticketNumber}/assign`, { userId });
  },

  setStatus: async (ticketNumber: string, status: TicketStatus | string, reason?: string) => {
    return apiClient.post(`/tickets/${ticketNumber}/status`, { status, reason });
  },

  closeTicket: async (ticketNumber: string, reason?: string) => {
    return apiClient.post(`/tickets/${ticketNumber}/close`, reason ? { reason } : undefined);
  },

  setPriority: async (ticketNumber: string, priority: TicketPriority | string) => {
    return apiClient.post(`/tickets/${ticketNumber}/priority`, { priority });
  },

  addTag: async (ticketNumber: string, tag: string) => {
    return apiClient.post(`/tickets/${ticketNumber}/tags`, { tag });
  },

  removeTag: async (ticketNumber: string, tag: string) => {
    return apiClient.delete(`/tickets/${ticketNumber}/tags/${encodeURIComponent(tag)}`);
  },

  getHistory: async (ticketNumber: string): Promise<TicketHistoryResponse> => {
    return apiClient.get<TicketHistoryResponse>(`/tickets/${ticketNumber}/history`);
  },

  addNote: async (ticketNumber: string, note: string) => {
    return apiClient.post(`/tickets/${ticketNumber}/notes`, { note });
  },

  sendByTicket: async (ticketNumber: string, text: string) => {
    return apiClient.post('/messages/send-by-ticket', { ticketNumber, text });
  },
};
