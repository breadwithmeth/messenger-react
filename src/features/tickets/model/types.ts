export type TicketStatus = 'new' | 'open' | 'in_progress' | 'pending' | 'resolved' | 'closed';

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TicketStats = {
  total: number;
  byStatus: Partial<Record<TicketStatus | string, number>>;
  byPriority: Partial<Record<TicketPriority | string, number>>;
};

export type TicketAssignee = {
  id?: number;
  username?: string;
  email?: string;
  name?: string;
} | null;

export type Ticket = {
  ticketNumber: string;
  status: TicketStatus | string;
  priority: TicketPriority | string;
  category?: string | null;
  assignedUserId?: number | null;
  assignedUser?: TicketAssignee;
  tags?: string[];
  updatedAt?: string;
  createdAt?: string;
  closedAt?: string | null;
};

export type TicketPagination = {
  total: number;
  page: number;
  limit: number;
  pages: number;
};

export type TicketsListResponse = {
  tickets: Ticket[];
  pagination: TicketPagination;
};

export type TicketMessagesResponse = {
  messages: unknown[];
};

export type TicketHistoryResponse = {
  history: unknown[];
};

export type AssignTicketResponse = {
  success: boolean;
  ticket: Ticket;
  history?: unknown;
};

export type TicketQueryParams = {
  status?: TicketStatus | string;
  priority?: TicketPriority | string;
  assignedUserId?: number;
  category?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};
