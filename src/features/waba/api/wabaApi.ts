import { apiClient } from '@/shared/api/client';
import type { BroadcastTemplatePayload, BroadcastTemplateResponse } from '../model/types';

export const wabaApi = {
  broadcastTemplate: async (payload: BroadcastTemplatePayload): Promise<BroadcastTemplateResponse> => {
    return apiClient.post<BroadcastTemplateResponse, BroadcastTemplatePayload>('/waba/broadcast-template', payload);
  },
};
