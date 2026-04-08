import axios from 'axios';
import { Platform } from 'react-native';
import { API_BASE_URL } from './apiConfig';
import { authService, getAuthHeaders } from './authService';

const normalizeRoutinePayload = (mealTimes = {}) => ({
  breakfast: mealTimes.breakfast || '08:00 AM',
  lunch: mealTimes.lunch || '01:00 PM',
  dinner: mealTimes.dinner || '07:00 PM',
  sleep: mealTimes.sleep || '10:30 PM',
});

const ensureRoutineAuthHeaders = async () => {
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Login required. Please sign in and try again.');
  }

  return getAuthHeaders();
};

export const routineService = {
  getRoutine: async () => {
    try {
      const headers = await ensureRoutineAuthHeaders();
      console.log('[RoutineService] Connecting to:', `${API_BASE_URL}/routines`);
      console.log('[RoutineService] Platform:', Platform.OS);
      const response = await axios.get(`${API_BASE_URL}/routines`, { headers });
      console.log('[RoutineService] GET response:', response.data);
      return response.data;
    } catch (error) {
      if (error?.message === 'Login required. Please sign in and try again.') {
        throw error;
      }

      if (error?.response?.status === 401) {
        throw new Error('Session expired. Please login again.');
      }

      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      console.error('[RoutineService] GET error:', errorMsg);
      console.error('[RoutineService] Full error:', error);
      throw new Error(`Cannot connect to backend. URL: ${API_BASE_URL}/routines. Error: ${errorMsg}`);
    }
  },

  saveRoutine: async (mealTimes) => {
    try {
      const headers = await ensureRoutineAuthHeaders();
      const payload = {
        mealTimes: normalizeRoutinePayload(mealTimes),
      };
      console.log('[RoutineService] POST to:', `${API_BASE_URL}/routines`);
      console.log('[RoutineService] Payload:', payload);
      const response = await axios.post(`${API_BASE_URL}/routines`, payload, { headers });
      console.log('[RoutineService] POST response:', response.data);
      return response.data;
    } catch (error) {
      if (error?.message === 'Login required. Please sign in and try again.') {
        throw error;
      }

      if (error?.response?.status === 401) {
        throw new Error('Session expired. Please login again.');
      }

      const errorMsg = error.response?.data?.error || error.message || 'Unknown error';
      console.error('[RoutineService] POST error:', errorMsg);
      console.error('[RoutineService] Full error:', error);
      throw new Error(`Cannot save to backend. URL: ${API_BASE_URL}/routines. Error: ${errorMsg}`);
    }
  },
};

export default routineService;
