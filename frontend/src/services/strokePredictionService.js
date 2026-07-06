import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

export const strokePredictionService = {
  async getContext() {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/predict/stroke/context`, { headers });
    return response.data;
  },

  async predict(values, conversationId = null) {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${API_BASE_URL}/predict/stroke`,
      { ...values, conversationId },
      { headers }
    );
    return response.data;
  },

  async chat(message, conversationId = null) {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${API_BASE_URL}/predict/stroke/chat`,
      { message, conversationId },
      { headers }
    );
    return response.data;
  },
};

export default strokePredictionService;
