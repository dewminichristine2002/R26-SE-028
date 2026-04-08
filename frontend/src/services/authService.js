import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE_URL } from './apiConfig';

const TOKEN_KEY = 'eldermeds_token';
const USER_KEY = 'eldermeds_user';
const LOCAL_ACCOUNTS_KEY = 'eldermeds_local_accounts';
const LOCAL_MODE_KEY = 'eldermeds_local_mode';

const authClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authService = {
  async register(payload) {
    try {
      const response = await authClient.post('/auth/register', payload);
      await AsyncStorage.setItem(TOKEN_KEY, response.data.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
      await AsyncStorage.removeItem(LOCAL_MODE_KEY);
      return response.data;
    } catch (error) {
      if (error.response?.status === 503 || error.message === 'Network Error') {
        const accountsRaw = await AsyncStorage.getItem(LOCAL_ACCOUNTS_KEY);
        const accounts = accountsRaw ? JSON.parse(accountsRaw) : [];
        const normalizedEmail = String(payload.email || '').trim().toLowerCase();

        if (accounts.some((account) => account.email === normalizedEmail)) {
          throw new Error('An account with this email already exists on this device.');
        }

        const localUser = {
          id: `local-${Date.now()}`,
          fullName: String(payload.fullName || '').trim(),
          email: normalizedEmail,
          phone: '',
          dateOfBirth: '',
          bloodType: '',
        };

        accounts.push({
          ...localUser,
          password: String(payload.password || ''),
        });

        await AsyncStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
        await AsyncStorage.setItem(TOKEN_KEY, `local-token-${localUser.id}`);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(localUser));
        await AsyncStorage.setItem(LOCAL_MODE_KEY, 'true');

        return {
          token: `local-token-${localUser.id}`,
          user: localUser,
          isLocalAccount: true,
        };
      }

      throw error;
    }
  },

  async login(payload) {
    try {
      const response = await authClient.post('/auth/login', payload);
      await AsyncStorage.setItem(TOKEN_KEY, response.data.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.data.user));
      await AsyncStorage.removeItem(LOCAL_MODE_KEY);
      return response.data;
    } catch (error) {
      if (error.response?.status === 503 || error.message === 'Network Error') {
        const accountsRaw = await AsyncStorage.getItem(LOCAL_ACCOUNTS_KEY);
        const accounts = accountsRaw ? JSON.parse(accountsRaw) : [];
        const normalizedEmail = String(payload.email || '').trim().toLowerCase();
        const account = accounts.find((item) => item.email === normalizedEmail);

        if (!account || account.password !== String(payload.password || '')) {
          throw new Error('Local login failed. Check your email and password for this device.');
        }

        const localUser = {
          id: account.id,
          fullName: account.fullName,
          email: account.email,
          phone: account.phone || '',
          dateOfBirth: account.dateOfBirth || '',
          bloodType: account.bloodType || '',
        };

        await AsyncStorage.setItem(TOKEN_KEY, `local-token-${localUser.id}`);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(localUser));
        await AsyncStorage.setItem(LOCAL_MODE_KEY, 'true');

        return {
          token: `local-token-${localUser.id}`,
          user: localUser,
          isLocalAccount: true,
        };
      }

      throw error;
    }
  },

  async logout() {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY, LOCAL_MODE_KEY]);
  },

  async getToken() {
    return AsyncStorage.getItem(TOKEN_KEY);
  },

  async getStoredUser() {
    const user = await AsyncStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  async setStoredUser(user) {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  async isUsingLocalMode() {
    return (await AsyncStorage.getItem(LOCAL_MODE_KEY)) === 'true';
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
