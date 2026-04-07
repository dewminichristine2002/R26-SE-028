import { Platform } from 'react-native';

const defaultApi = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
const configuredApi = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_BASE_URL = configuredApi || defaultApi;
