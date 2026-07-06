import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000,
  headers: { 'Content-Type': 'application/json' },
});

export const assistantService = {
  async getSummary() {
    const headers = await getAuthHeaders();
    const response = await client.get('/assistant/summary', { headers });
    return response.data;
  },

  async chat({ message, conversationId } = {}) {
    const headers = await getAuthHeaders();
    const response = await client.post(
      '/assistant/chat',
      { message, conversationId: conversationId || null },
      { headers }
    );
    return response.data;
  },

  async listConversations() {
    const headers = await getAuthHeaders();
    const response = await client.get('/assistant/conversations', { headers });
    return response.data?.conversations || [];
  },

  async getConversationMessages(conversationId) {
    const headers = await getAuthHeaders();
    const response = await client.get(
      `/assistant/conversations/${conversationId}/messages`,
      { headers }
    );
    return response.data?.messages || [];
  },

  async renameConversation(conversationId, title) {
    const headers = await getAuthHeaders();
    const response = await client.patch(
      `/assistant/conversations/${conversationId}`,
      { title },
      { headers }
    );
    return response.data?.conversation;
  },

  async deleteConversation(conversationId) {
    const headers = await getAuthHeaders();
    const response = await client.delete(
      `/assistant/conversations/${conversationId}`,
      { headers }
    );
    return response.data;
  },
};

export default assistantService;
