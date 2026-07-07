import { NativeModules, Platform } from 'react-native';

const defaultApi = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
const configuredApi = process.env.EXPO_PUBLIC_API_URL;

const derivedHost = (() => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;

  if (!scriptURL) {
    return null;
  }

  const httpMatch = scriptURL.match(/^https?:\/\/([^/:]+)/i);
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

export const getApiBaseUrlCandidates = () => {
  const candidates = [configuredApi, devClientApi, defaultApi].filter(Boolean);
  return [...new Set(candidates)];
};

export const getBackendConnectionHelp = () =>
  [
    `Could not connect to the ElderMeds backend at ${API_BASE_URL}.`,
    'Make sure the backend is running on port 5000.',
    Platform.OS === 'android'
      ? 'For an Android emulator, use http://10.0.2.2:5000/api. For a physical phone, use your computer LAN IP, for example EXPO_PUBLIC_API_URL=http://192.168.x.x:5000/api.'
      : 'For iOS simulator/web, use http://localhost:5000/api. For a physical device, use your computer LAN IP.',
  ].join('\n');
