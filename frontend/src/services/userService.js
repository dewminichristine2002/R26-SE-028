import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { authService, getAuthHeaders } from './authService';

const userClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const userService = {
  async getMyProfile() {
    try {
      const headers = await getAuthHeaders();
      const response = await userClient.get('/users/me', { headers });
      await authService.setStoredUser(response.data.user);
      return response.data.user;
    } catch (error) {
      if (error.response?.status === 503 || error.message === 'Network Error') {
        const storedUser = await authService.getStoredUser();
        if (storedUser) {
          return storedUser;
        }
      }
      throw error;
    }
  },

  async updateMyProfile(payload) {
    try {
      const headers = await getAuthHeaders();
      const response = await userClient.put('/users/me', payload, { headers });
      await authService.setStoredUser(response.data.user);
      return response.data.user;
    } catch (error) {
      if (error.response?.status === 503 || error.message === 'Network Error') {
        const storedUser = await authService.getStoredUser();
        const mergedUser = {
          ...storedUser,
          ...payload,
        };
        await authService.setStoredUser(mergedUser);
        return mergedUser;
      }
      throw error;
    }
  },
};
