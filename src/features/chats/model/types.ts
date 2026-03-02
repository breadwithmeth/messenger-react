export interface OrganizationPhone {
  id: number;
  phoneJid: string;
  displayName: string;
  connectionType: string;
}

export interface TelegramBot {
  id: number;
  botUsername: string;
  botName: string;
}

export interface AssignedUser {
  id: number;
  name: string | null;
  email: string;
}

export type ChatPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface SenderUser {
  id: number;
  name: string;
  email: string;
}

export interface LastMessage {
  id: number;
  content: string;
  senderJid: string | null;
  timestamp: string;
  fromMe: boolean;
  type: string;
  isReadByOperator: boolean;
  mediaUrl: string | null;
}

export interface Chat {
  id: number;
  name: string;
  channel: 'whatsapp' | 'telegram';
  remoteJid: string | null;
  receivingPhoneJid: string | null;
  isGroup: boolean;
  status: 'new' | 'pending' | 'active' | 'open' | 'closed';
  priority: ChatPriority;
  unreadCount: number;
  lastMessageAt: string;
  ticketNumber: number;
  createdAt: string;
  organizationPhone: OrganizationPhone | null;
  telegramBot: TelegramBot | null;
  telegramChatId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  assignedUser: AssignedUser | null;
  organizationClients: unknown[];
  lastMessage: LastMessage | null;
  displayName: string;
  profilePhotoUrl: string | null;
}

export interface ChatsResponse {
  chats: Chat[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface Message {
  id: number;
  whatsappMessageId?: string;
  content: string;
  senderJid: string;
  receivingPhoneJid: string;
  fromMe: boolean;
  type: string;
  mediaUrl: string | null;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  timestamp: string;
  status: string;
  isReadByOperator: boolean;
  quotedMessageId: string | null;
  senderUser: SenderUser | null;
  ticketNumber?: number;
  ticketStatus?: string;
  ticketPriority?: string;
  ticket?: {
    ticketNumber?: number;
    status?: string;
    priority?: string;
  } | null;
  responsibleUser?: SenderUser | null;
}

export interface MessagesResponse {
  messages: Message[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    oldestTimestamp: string;
    newestTimestamp: string;
  };
}
