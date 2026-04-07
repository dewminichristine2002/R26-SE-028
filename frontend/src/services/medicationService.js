import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

export const medicationService = {
  async getSuggestions(query) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return [];
    }

    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/medications/suggestions`, {
      params: { q: trimmed },
      headers,
    });

    return response.data?.suggestions || [];
  },

  async saveMedication(payload) {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/medications`, payload, { headers });
    return response.data?.medication;
  },

  async getColorsForMedicineName(medicineName) {
    const trimmed = (medicineName || '').trim();
    if (!trimmed) {
      return [];
    }

    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/medications/colors`, {
      params: { medicineName: trimmed },
      headers,
    });

    return response.data?.colors || [];
  },

  async getAppearancesForMedicineName(medicineName) {
    const trimmed = (medicineName || '').trim();
    if (!trimmed) {
      return [];
    }

    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/medications/appearances`, {
      params: { medicineName: trimmed },
      headers,
    });

    return response.data?.appearances || [];
  },

  async getMyMedications() {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/medications`, { headers });
    return response.data?.medications || [];
  },

  async getMedicationById(id) {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/medications/${id}`, { headers });
    return response.data?.medication;
  },

  async updateMedication(id, payload) {
    const headers = await getAuthHeaders();
    const response = await axios.put(`${API_BASE_URL}/medications/${id}`, payload, { headers });
    return response.data?.medication;
  },

  async deleteMedication(id) {
    const headers = await getAuthHeaders();
    const response = await axios.delete(`${API_BASE_URL}/medications/${id}`, { headers });
    return response.data;
  },

  async saveMedicationStatusEvent(payload) {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/medications/status-events`, payload, { headers });
    return response.data?.statusEvent;
  },

  async getTodayLatestStatusEvents() {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/medications/status-events/today-latest`, { headers });
    return response.data?.events || [];
  },

  async getMedicineStockOverview() {
    const headers = await getAuthHeaders();
    const response = await axios.get(`${API_BASE_URL}/medications/stock`, { headers });
    return response.data;
  },

  async autoNotifyCaregiverForLowStock() {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/medications/stock/auto-notify`, {}, { headers });
    return response.data;
  },

  async notifyCaregiverLowStock(medicationId) {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/medications/${medicationId}/low-stock-notify`, {}, { headers });
    return response.data;
  },

  async refillMedicationStock(medicationId, refillTablets) {
    const headers = await getAuthHeaders();
    const response = await axios.post(`${API_BASE_URL}/medications/${medicationId}/refill`, { refillTablets }, { headers });
    return response.data;
  },

  async notifyCaregiverRefill(medicationId, refillTablets) {
    const headers = await getAuthHeaders();
    const payload = {};
    if (Number.isFinite(Number(refillTablets)) && Number(refillTablets) > 0) {
      payload.refillTablets = Number(refillTablets);
    }
    const response = await axios.post(`${API_BASE_URL}/medications/${medicationId}/refill-notify`, payload, { headers });
    return response.data;
  },
};
