import { NativeModules, Platform } from 'react-native';

const defaultApi = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
const configuredApi = process.env.EXPO_PUBLIC_API_URL?.trim();
const scriptURL = NativeModules.SourceCode?.scriptURL || '';

const derivedHost = (() => {
  const httpMatch = scriptURL.match(/https?:\/\/([^/:]+)/i);
  if (httpMatch?.[1]) {
    return httpMatch[1];
  }

  const expoMatch = scriptURL.match(/exp(?:s)?:\/\/([^/:]+)/i);
  if (expoMatch?.[1]) {
    return expoMatch[1];
  }

  return null;
})();

const devClientApi = derivedHost ? `http://${derivedHost}:5000/api` : null;

// Prefer the explicit env override first, then fall back to the Metro host in
// dev client scenarios, and finally use the emulator defaults.
export const API_BASE_URL = configuredApi || devClientApi || defaultApi;
