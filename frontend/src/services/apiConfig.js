import { NativeModules, Platform } from 'react-native';

const defaultApi = Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';

// Strip all whitespace so typos like "192.168.1.1 :5000" still parse as a valid URL.
const configuredApi = (() => {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (raw == null || !String(raw).trim()) return undefined;
  return String(raw).replace(/\s+/g, '').trim();
})();

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

// Always honor EXPO_PUBLIC_API_URL when set. Do not substitute the Metro host
// for port 5000 - that host often comes from Expo tunnel domains without a
// backend there, and swapping LAN IPs silently confuses hotspot setups.
export const API_BASE_URL = configuredApi || devClientApi || defaultApi;

export const getApiBaseUrlCandidates = () => {
  const candidates = [configuredApi, devClientApi, defaultApi]
    .filter(Boolean)
    .map((value) => String(value).trim());

  return candidates.filter((value, index) => candidates.indexOf(value) === index);
};

export const isLikelyHotspotLanBackend = (url = API_BASE_URL) =>
  /https?:\/\/172\.(1[6-9]|2\d|3[0-1])\./i.test(String(url || ''));

export const getBackendConnectionHelp = () => {
  if (API_BASE_URL.includes('10.0.2.2')) {
    return 'Cannot reach the backend. 10.0.2.2 only works in the Android emulator. On a physical phone, set EXPO_PUBLIC_API_URL to your laptop IP on the same Wi-Fi.';
  }

  const hotspot =
    isLikelyHotspotLanBackend(API_BASE_URL)
      ? ' This backend address is in the 172.16-31.x.x range, which can be a hotspot network. That does not always fail, but if this request keeps timing out, try one of these: (1) Connect phone + laptop to the same Wi-Fi router; (2) USB: run adb reverse tcp:5000 tcp:5000, set EXPO_PUBLIC_API_URL=http://127.0.0.1:5000/api, restart Metro; (3) Run ngrok http 5000 and set EXPO_PUBLIC_API_URL to https://YOUR-URL.ngrok-free.app/api. '
      : ' ';

  return `Cannot reach the backend at ${API_BASE_URL}.${hotspot}Also verify: backend is running (npm start in backend/), Windows Firewall allows inbound Node on port 5000, and EXPO_PUBLIC_API_URL in frontend/.env ends with /api - then restart npx expo start.`;
};
