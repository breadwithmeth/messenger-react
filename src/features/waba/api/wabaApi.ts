import { apiClient } from '@/shared/api/client';
import type {
  BroadcastTemplatePayload,
  BroadcastTemplateResponse,
  GetWabaTemplatesParams,
  WabaTemplatesResponse,
} from '../model/types';

export const wabaApi = {
  broadcastTemplate: async (payload: BroadcastTemplatePayload): Promise<BroadcastTemplateResponse> => {
    return apiClient.post<BroadcastTemplateResponse, BroadcastTemplatePayload>('/waba/broadcast-template', payload);
  },
  getTemplates: async (params: GetWabaTemplatesParams): Promise<WabaTemplatesResponse> => {
    const query = new URLSearchParams();
    query.set('organizationPhoneId', String(params.organizationPhoneId));
    if (typeof params.limit === 'number') query.set('limit', String(params.limit));
    if (params.after) query.set('after', params.after);
    if (params.name) query.set('name', params.name);
    if (params.language) query.set('language', params.language);
    if (params.status) query.set('status', params.status);
    if (params.category) query.set('category', params.category);
    return apiClient.get<WabaTemplatesResponse>(`/waba/templates?${query.toString()}`);
  },
};
