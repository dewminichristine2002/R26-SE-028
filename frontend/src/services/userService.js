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
    const headers = await getAuthHeaders();
    const response = await userClient.get('/users/me', { headers });
    await authService.setStoredUser(response.data.user);
    return response.data.user;
  },

  async updateMyProfile(payload) {
    const headers = await getAuthHeaders();
    const response = await userClient.put('/users/me', payload, { headers });
    await authService.setStoredUser(response.data.user);
    return response.data.user;
  },
};
