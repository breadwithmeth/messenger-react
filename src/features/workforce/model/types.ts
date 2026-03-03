export type EmployeeDto = {
  id: string;
  keycloakId: string;
  email?: string;
  username?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkforceMessageDto = {
  id: number;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  chatId: number;
  channel: string;
};

export type PresenceHistoryDto = {
  status: 'ONLINE' | 'OFFLINE' | 'AWAY' | 'BUSY' | 'IDLE';
  changedAt?: string;
  messages: WorkforceMessageDto[];
};

export type WorkforceActivityDto = {
  range?: {
    from: string;
    to: string;
  };
  presenceHistory: PresenceHistoryDto[];
  messages: {
    inbound: number;
    outbound: number;
    recent: WorkforceMessageDto[];
  };
};
