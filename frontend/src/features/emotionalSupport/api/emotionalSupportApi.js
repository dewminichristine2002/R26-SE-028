import axios from 'axios';
import { API_BASE_URL } from '../../../services/apiConfig';

const normalizedApiBaseUrl = API_BASE_URL.replace(/\/$/, '');

const emotionalSupportApi = axios.create({
  baseURL: `${normalizedApiBaseUrl}/emotional-support`,
  timeout: 10000,
});

export const emotionalSupportApiBaseUrl = `${normalizedApiBaseUrl}/emotional-support`;

const withComponent4ErrorHandling = async (request) => {
  try {
    const response = await request();
    return response.data;
  } catch (error) {
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.response?.data?.errors?.join?.(', ') ||
      error.message ||
      'We could not complete that request. Please try again.';

    throw new Error(message);
  }
};

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

export const createMoodCheckin = (payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post('/mood-checkin', payload));

export const processNarrative = (payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post('/process-narrative', payload));

export const getNextAdaptiveQuestion = (payload) =>
  withComponent4ErrorHandling(() =>
    emotionalSupportApi.get('/adaptive-question-bank/next', { params: payload })
  );

export const startAdaptiveChat = (payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post('/adaptive-chat/start', payload));

export const respondAdaptiveChat = (payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post('/adaptive-chat/respond', payload));
export const startAdaptiveActivity = (payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post('/adaptive-activities/start', payload));
export const getCognitiveActivities = (userId) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.get('/cognitive-activities', { params: { user_id: Number(userId) } }));
export const submitAdaptiveActivity = (attemptId, payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post(`/adaptive-activities/attempts/${attemptId}/submit`, payload));

export const getEmotionalTrends = (userId) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.get(`/trends/${Number(userId)}`));
export const getWellnessTrends = (userId, period = '7d') =>
  withComponent4ErrorHandling(() => emotionalSupportApi.get(`/wellness-trends/${Number(userId)}`, { params: { period } }));
export const getWellnessSummary = (userId, period = '30d') =>
  withComponent4ErrorHandling(() => emotionalSupportApi.get(`/wellness-summary/${Number(userId)}`, { params: { period } }));
export const getAdaptiveCaregiverAlerts = (userId, period = '30d') =>
  withComponent4ErrorHandling(() => emotionalSupportApi.get(`/caregiver-alerts/${Number(userId)}`, { params: { period } }));

// Consent-based personalized reminiscence topics.
export const previewReminiscenceTopic = (payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post('/reminiscence-topics/preview', payload));
export const saveReminiscenceTopic = (payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post('/reminiscence-topics', payload));
export const getReminiscenceTopics = (userId) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.get(`/reminiscence-topics/${Number(userId)}`));
export const deleteReminiscenceTopic = (topicId, userId) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.delete(`/reminiscence-topics/${topicId}`, { data: { user_id: Number(userId) } }));
export const clearReminiscenceTopics = (userId) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.delete(`/reminiscence-topics/user/${Number(userId)}`));
export const getReminiscencePrompt = (userId) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.get(`/reminiscence-prompt/${Number(userId)}`));

// Memory entries (Life Book, Good Deeds) — photos remain local-only and are not uploaded.
export const createMemoryEntry = (payload) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.post('/reminiscence-entries', payload));
export const listMemoryEntries = (userId, entryType = null) =>
  withComponent4ErrorHandling(() =>
    emotionalSupportApi.get(`/reminiscence-entries/${Number(userId)}`, { params: entryType ? { entry_type: entryType } : {} })
  );
export const deleteMemoryEntry = (entryId, userId) =>
  withComponent4ErrorHandling(() => emotionalSupportApi.delete(`/reminiscence-entries/${entryId}`, { data: { user_id: Number(userId) } }));

export default emotionalSupportApi;
