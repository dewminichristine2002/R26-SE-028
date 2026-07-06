import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE_URL, getBackendConnectionHelp } from './apiConfig';

const TOKEN_KEY = 'eldermeds_token';
const USER_KEY = 'eldermeds_user';

const authClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const isBackendUnavailableError = (error) =>
  error?.response?.status === 503 || error?.message === 'Network Error';

const toBackendUnavailableError = () => new Error(getBackendConnectionHelp());
const isLocalTokenValue = (token) => String(token || '').startsWith('local-token-');

export const authService = {
  async register(payload) {
    const response = await authClient.post('/auth/register', payload);
    await AsyncStorage.setItem(TOKEN_KEY, response.data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
    return response.data;
  },

  async login(payload) {
    const response = await authClient.post('/auth/login', payload);
    await AsyncStorage.setItem(TOKEN_KEY, response.data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
    return response.data;
  },

  async logout() {
    // Keep local user/app data on device; only clear active auth session token.
    await AsyncStorage.removeItem(TOKEN_KEY);
  },

  async getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  isLocalToken(token) {
    return isLocalTokenValue(token);
  },

  async getStoredUser() {
    const user = await AsyncStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  async setStoredUser(user) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  },
};

export const getAuthHeaders = async () => {
  const token = await authService.getToken();
  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};
