import { apiClient } from '@/shared/api/client';
import type {
  ConnectOrganizationPhoneResponse,
  CreateOrganizationPhonePayload,
  DisconnectOrganizationPhoneResponse,
  OrganizationPhone,
} from '../model/types';

export const organizationPhonesApi = {
  getAll: async (): Promise<OrganizationPhone[]> => {
    return apiClient.get<OrganizationPhone[]>('/organization-phones/all');
  },

  create: async (payload: CreateOrganizationPhonePayload): Promise<OrganizationPhone> => {
    return apiClient.post<OrganizationPhone, CreateOrganizationPhonePayload>('/organization-phones', payload);
  },

  connect: async (organizationPhoneId: number): Promise<ConnectOrganizationPhoneResponse> => {
    return apiClient.post<ConnectOrganizationPhoneResponse>(`/organization-phones/${organizationPhoneId}/connect`);
  },

  disconnect: async (organizationPhoneId: number): Promise<DisconnectOrganizationPhoneResponse> => {
    return apiClient.delete<DisconnectOrganizationPhoneResponse>(`/organization-phones/${organizationPhoneId}/disconnect`);
  },
};
