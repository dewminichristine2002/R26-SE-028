import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

export const healthAdviceService = {
  async ask({ question, riskType, latestPrediction, conversationId } = {}) {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${API_BASE_URL}/health-advice`,
      {
        question,
        riskType,
        latestPrediction: latestPrediction || {},
        conversationId: conversationId || null,
      },
      { headers }
    );
    return response.data;
  },
};

export default healthAdviceService;
