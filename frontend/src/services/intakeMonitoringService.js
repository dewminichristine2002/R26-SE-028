import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

export const intakeMonitoringService = {
  async analyzePalmPhoto({ imageBase64, expectedCount }) {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${API_BASE_URL}/intake-monitoring/analyze-palm`,
      {
        imageBase64,
        expectedCount,
      },
      { headers }
    );
    return response.data;
  },

  async analyzeMotion({ frames, swallowConfirmed }) {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${API_BASE_URL}/intake-monitoring/analyze-motion`,
      {
        frames,
        swallowConfirmed,
      },
      { headers }
    );
    return response.data;
  },

  async analyzeMotionVideo({ videoBase64, extension = 'mp4', swallowConfirmed = false }) {
    const headers = await getAuthHeaders();
    const response = await axios.post(
      `${API_BASE_URL}/intake-monitoring/analyze-motion-video`,
      {
        videoBase64,
        extension,
        swallowConfirmed,
      },
      { headers }
    );
    return response.data;
  },
};
