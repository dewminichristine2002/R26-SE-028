import axios from 'axios';
import { API_BASE_URL, getBackendConnectionHelp } from './apiConfig';
import { authService, getAuthHeaders } from './authService';

const userClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const isNetworkError = (error) => error?.message === 'Network Error' || error?.code === 'ERR_NETWORK';

export const userService = {
  async getMyProfile() {
    try {
      const headers = await getAuthHeaders();
      const response = await userClient.get('/users/me', { headers });
      await authService.setStoredUser(response.data.user);
      return response.data.user;
    } catch (error) {
      if (isNetworkError(error)) {
        const storedUser = await authService.getStoredUser();
        if (storedUser) {
          return storedUser;
        }

        throw new Error(getBackendConnectionHelp());
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
      if (isNetworkError(error)) {
        throw new Error(getBackendConnectionHelp());
      }

      throw error;
    }
  },
};
