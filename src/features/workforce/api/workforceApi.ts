import { apiClient } from '@/shared/api/client';
import type { EmployeeDto } from '../model/types';

export const workforceApi = {
  getEmployees: async (): Promise<EmployeeDto[]> => {
    return apiClient.get<EmployeeDto[]>('/workforce/employees');
  },

  sendHeartbeat: async (): Promise<void> => {
    await apiClient.post('/workforce/presence/heartbeat');
  },
};
