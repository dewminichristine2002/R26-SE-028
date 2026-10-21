import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

const caregiverAlertClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const caregiverAlertService = {
  async getCaregiverAlerts() {
    const headers = await getAuthHeaders();
    const response = await caregiverAlertClient.get('/users/caregiver-alerts', { headers });
    return {
      alerts: response.data?.alerts || [],
      unreadCount: Number(response.data?.unreadCount) || 0,
    };
  },

  async markAlertRead(alertId) {
    const headers = await getAuthHeaders();
    const response = await caregiverAlertClient.patch(`/users/caregiver-alerts/${alertId}/read`, {}, { headers });
    return response.data?.alert;
  },

  async getCaregiverTimeline() {
    const headers = await getAuthHeaders();
    const response = await caregiverAlertClient.get('/users/caregiver-timeline', { headers });
    return response.data?.timeline || [];
  },
};

export default caregiverAlertService;
