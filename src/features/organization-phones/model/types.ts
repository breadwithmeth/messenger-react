export type OrganizationPhoneStatus =
  | 'disconnected'
  | 'pending'
  | 'connected'
  | 'logged_out'
  | string;

export type OrganizationPhone = {
  id: number;
  phoneJid: string;
  displayName: string | null;
  status: OrganizationPhoneStatus;
  qrCode: string | null;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrganizationPhonePayload = {
  phoneJid: string;
  displayName: string;
};

export type ConnectOrganizationPhoneResponse = {
  message?: string;
  status?: 'connected' | 'connecting' | string;
};

export type DisconnectOrganizationPhoneResponse = {
  message: string;
};
