import { NativeModules, Platform } from 'react-native';

const normalizeApiUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

const defaultApi = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
const configuredApi = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);

const derivedHost = (() => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;

  if (!scriptURL) {
    return null;
  }

  try {
    const parsed = new URL(scriptURL);
    if (parsed.hostname) {
      return parsed.hostname;
    }
  } catch {
    // Fall through to the Expo URL pattern below.
  }

  const hostMatch = scriptURL.match(/^(?:https?|exp(?:s)?):\/\/([^/:]+)/i);
  if (hostMatch?.[1]) {
    return hostMatch[1];
  }

  return null;
})();

const devClientApi = derivedHost ? `http://${derivedHost}:5000/api` : null;

// Prefer the explicit env override first, then fall back to the Metro host in
// dev client scenarios, and finally use the emulator defaults.
export const API_BASE_URL = configuredApi || devClientApi || defaultApi;

export const getApiBaseUrlCandidates = () =>
  Array.from(
    new Set(
      [API_BASE_URL, configuredApi, devClientApi, defaultApi]
        .map(normalizeApiUrl)
        .filter(Boolean)
    )
  );

export const getBackendConnectionHelp = () =>
  [
    `Cannot connect to the backend at ${API_BASE_URL}.`,
    'Make sure the backend is running with npm.cmd start.',
    'If you are using a physical phone, keep the phone and PC on the same Wi-Fi/LAN and allow Node.js through Windows Firewall for private networks on port 5000.',
    `Tried API base URLs: ${getApiBaseUrlCandidates().join(', ')}.`,
  ].join(' ');
