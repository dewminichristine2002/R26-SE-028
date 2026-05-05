import axios from 'axios';

const rawApiBaseUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
const normalizedApiBaseUrl = rawApiBaseUrl.replace(/\/$/, '');

const emotionalSupportApi = axios.create({
  baseURL: `${normalizedApiBaseUrl}/api/emotional-support`,
  timeout: 10000,
});

export const createCheckIn = (payload) => emotionalSupportApi.post('/check-ins', payload);
export const getChatLogs = (sessionId) =>
  emotionalSupportApi.get(`/sessions/${sessionId}/chat-logs`);
export const getEmotionHistory = (elderId, limit = 20) =>
  emotionalSupportApi.get(`/elders/${elderId}/history`, { params: { limit } });
export const getTrendSummary = (elderId) =>
  emotionalSupportApi.get(`/elders/${elderId}/trends/summary`);
export const getNextActivity = (elderId, emotion) =>
  emotionalSupportApi.get(`/elders/${elderId}/activities/next`, { params: { emotion } });
export const submitActivityAttempt = (activityId, payload) =>
  emotionalSupportApi.post(`/activities/${activityId}/attempts`, payload);
export const getCaregiverElders = (caregiverId) =>
  emotionalSupportApi.get(`/caregivers/${caregiverId}/elders`);
export const getCaregiverAlerts = (caregiverId, status = 'open') =>
  emotionalSupportApi.get(`/caregivers/${caregiverId}/alerts`, { params: { status } });
export const acknowledgeAlert = (alertId, caregiverId) =>
  emotionalSupportApi.patch(`/alerts/${alertId}/acknowledge`, { caregiverId });
export const getCaregiverElderDetail = (caregiverId, elderId) =>
  emotionalSupportApi.get(`/caregivers/${caregiverId}/elders/${elderId}`);

export default emotionalSupportApi;
