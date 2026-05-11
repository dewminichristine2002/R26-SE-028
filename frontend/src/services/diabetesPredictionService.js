import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

export const diabetesPredictionService = {
  async getContext() {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/predict/diabetes/context`, { headers });
    return response.data;
  },

  async predict(values, conversationId = null) {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${API_BASE_URL}/predict/diabetes`,
      { ...values, conversationId },
      { headers }
    );
    return response.data;
  },

  async chat(message, conversationId = null) {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${API_BASE_URL}/predict/diabetes/chat`,
      { message, conversationId },
      { headers }
    );
    return response.data;
  },
};

export default diabetesPredictionService;
