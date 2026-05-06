import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { authService, getAuthHeaders } from './authService';

const allergyClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const request = async (method, url, data) => {
  const headers = await getAuthHeaders();
  const response = await allergyClient.request({
    method,
    url,
    data,
    headers,
  });

  return response.data;
};

const shouldUseLocalFallback = (error) => error?.response?.status === 503 || error?.message === 'Network Error';

const getCurrentUserId = async () => {
  const user = await authService.getStoredUser();
  return user?.id || 'local-user';
};

const buildKey = async (name) => {
  const userId = await getCurrentUserId();
  return `eldermeds_${name}_${userId}`;
};

const readLocal = async (name, defaultValue) => {
  const key = await buildKey(name);
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : defaultValue;
};

const writeLocal = async (name, value) => {
  const key = await buildKey(name);
  await AsyncStorage.setItem(key, JSON.stringify(value));
  return value;
};

const createLocalCard = async (payload) => {
  const cards = await readLocal('allergy_cards', []);
  const history = await readLocal('allergy_history', []);
  const nextId = Date.now();
  const createdAt = new Date().toISOString();

  const card = {
    id: nextId,
    title: payload.title,
    medicineName: payload.medicineName,
    normalizedDrugName: payload.normalizedDrugName,
    status: payload.status || 'completed',
    riskScore: payload.riskScore ?? null,
    riskLevel: payload.riskLevel || '',
    explanation: payload.explanation || '',
    recommendation: payload.recommendation || '',
    riskFactors: payload.riskFactors || [],
    createdAt,
    updatedAt: createdAt,
  };

  const historyEntry = payload.historyEntry
    ? {
        id: nextId,
        userId: await getCurrentUserId(),
        inputMethod: payload.historyEntry.inputMethod || 'manual',
        rawInput: payload.historyEntry.rawInput || '',
        medicineName: payload.historyEntry.medicineName || payload.medicineName || '',
        normalizedDrugName: payload.historyEntry.normalizedDrugName || payload.normalizedDrugName || '',
        dose: payload.historyEntry.dose || '',
        frequency: payload.historyEntry.frequency || '',
        riskScore: payload.historyEntry.riskScore ?? payload.riskScore ?? null,
        riskLevel: payload.historyEntry.riskLevel || payload.riskLevel || '',
        createdAt,
      }
    : null;

  await writeLocal('allergy_cards', [card, ...cards]);
  if (historyEntry) {
    await writeLocal('allergy_history', [historyEntry, ...history]);
  }

  return card;
};

export const allergyService = {
  async getProfile() {
    try {
      const data = await request('get', '/allergies/profile');
      await writeLocal('allergy_profile', data.profile);
      return data.profile;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return readLocal('allergy_profile', {
          age: '',
          gender: '',
          hasMedicineAllergy: null,
          knownAllergiesText: '',
          chronicDiseasesText: '',
          currentMedicationsText: '',
          emergencyContact: '',
          caregiverDetails: '',
          profileCompleted: false,
          reactionSymptomsText: '',
          suspectedMedicineNamesText: '',
          avoidedMedicinesText: '',
          antibioticPainkillerReaction: '',
        });
      }
      throw error;
    }
  },

  async saveProfile(payload) {
    try {
      const data = await request('put', '/allergies/profile', payload);
      await writeLocal('allergy_profile', data.profile);
      return data.profile;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return writeLocal('allergy_profile', payload);
      }
      throw error;
    }
  },

  async getQuestionnaire() {
    try {
      const data = await request('get', '/allergies/questionnaire');
      await writeLocal('allergy_questionnaire', data.answers);
      return data.answers;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return readLocal('allergy_questionnaire', []);
      }
      throw error;
    }
  },

  async saveQuestionnaire(answers) {
    try {
      const data = await request('post', '/allergies/questionnaire', { answers });
      await writeLocal('allergy_questionnaire', data.answers);
      return data.answers;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return writeLocal('allergy_questionnaire', answers);
      }
      throw error;
    }
  },

  async getCards() {
    try {
      const data = await request('get', '/allergies/cards');
      await writeLocal('allergy_cards', data.cards);
      return data.cards;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return readLocal('allergy_cards', []);
      }
      throw error;
    }
  },

  async createCard(payload) {
    try {
      const data = await request('post', '/allergies/cards', payload);
      return data.card;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return createLocalCard(payload);
      }
      throw error;
    }
  },

  async analyzeMedicine(payload) {
    try {
      const data = await request('post', '/allergies/analyze', payload);
      return data;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        const offlineError = new Error(
          'Medicine safety analysis needs the backend connection. The app could not reach the server, so no real safety result was generated.'
        );
        offlineError.code = 'ANALYSIS_BACKEND_UNAVAILABLE';
        throw offlineError;
      }
      throw error;
    }
  },

  async updateCard(cardId, payload) {
    const data = await request('put', `/allergies/cards/${cardId}`, payload);
    return data.card;
  },

  async getHistory() {
    try {
      const data = await request('get', '/allergies/history');
      await writeLocal('allergy_history', data.history);
      return data.history;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return readLocal('allergy_history', []);
      }
      throw error;
    }
  },

  async saveReaction(payload) {
    try {
      const data = await request('post', '/allergies/reactions', payload);
      return data.reaction;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        const entry = {
          id: Date.now(),
          symptoms: payload.symptoms,
          severity: payload.severity || '',
          notes: payload.notes || '',
          createdAt: new Date().toISOString(),
        };
        const list = await readLocal('allergy_reactions', []);
        await writeLocal('allergy_reactions', [entry, ...list]);
        return entry;
      }
      throw error;
    }
  },

  async getReactions() {
    try {
      const data = await request('get', '/allergies/reactions');
      await writeLocal('allergy_reactions', data.reactions);
      return data.reactions;
    } catch (error) {
      if (shouldUseLocalFallback(error)) {
        return readLocal('allergy_reactions', []);
      }
      throw error;
    }
  },
};

export default allergyService;
