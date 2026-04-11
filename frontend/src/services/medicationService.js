import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
});

export async function searchMedications(query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    return [];
  }
  try {
    const headers = await getAuthHeaders();
    const { data } = await client.get('/medications/search', {
      params: { q },
      headers,
    });
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}
