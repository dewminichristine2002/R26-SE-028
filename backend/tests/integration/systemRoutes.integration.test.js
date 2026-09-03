const express = require('express');
const { requestJson } = require('../helpers/httpTestClient');

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(async (sql) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (normalized.includes('FROM users WHERE id')) {
        return {
          rows: [
            {
              id: 42,
              full_name: 'System Test Elder',
              email: 'elder@example.com',
              phone: '0771234567',
              date_of_birth: '1950-01-01',
              blood_type: 'O+',
              caregiver_email: 'caregiver@example.com',
              caregiver_phone: '0779876543',
            },
          ],
        };
      }
      return { rows: [] };
    }),
  },
  getPublicDatabaseStatus: () => ({
    connected: true,
    lastAttemptAt: '2026-08-31T00:00:00.000Z',
    lastError: null,
  }),
}));

jest.mock('../../src/middleware/databaseMiddleware', () => ({
  requireDatabase: (req, res, next) => next(),
}));

jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => {
    req.user = {
      id: 42,
      role: req.headers['x-test-role'] || 'user',
    };
    next();
  },
}));

jest.mock('../../src/models/routineModel', () => ({
  getRoutine: jest.fn(async () => ({
    id: 1,
    mealTimes: { breakfast: '08:00 AM', lunch: '01:00 PM', dinner: '07:00 PM', sleep: '10:30 PM' },
    updatedAt: '2026-08-31T00:00:00.000Z',
  })),
  saveRoutine: jest.fn(async (_userId, mealTimes) => ({
    id: 1,
    mealTimes,
    updatedAt: '2026-08-31T00:00:00.000Z',
  })),
}));

jest.mock('../../src/controllers/allergyController', () => ({
  fetchProfile: (req, res) => res.json({ profile: { userId: req.user.id, allergies: [] } }),
  saveProfile: (req, res) => res.json({ profile: { userId: req.user.id, ...req.body } }),
  fetchQuestionnaire: (req, res) => res.json({ questionnaire: [] }),
  saveQuestionnaire: (req, res) => res.status(201).json({ saved: true }),
  fetchCards: (req, res) => res.json({ cards: [] }),
  fetchCard: (req, res) => res.json({ card: { id: req.params.id } }),
  createCard: (req, res) => res.status(201).json({ card: { id: 1 } }),
  saveCard: (req, res) => res.json({ card: { id: req.params.id } }),
  fetchHistory: (req, res) => res.json({ history: [] }),
  fetchReactions: (req, res) => res.json({ reactions: [] }),
  createReaction: (req, res) => res.status(201).json({ reaction: { id: 1 } }),
  createClinicalOverride: (req, res) => res.status(201).json({ override: { id: 1 } }),
  analyzeMedicine: (req, res) => res.json({ result: { riskLevel: 'low' } }),
}));

jest.mock('../../src/controllers/checkInController', () => ({
  createCheckIn: (req, res) => res.status(201).json({ sessionId: 'session-1', riskLevel: 'low' }),
  getChatLogs: (req, res) => res.json({ sessionId: req.params.sessionId, items: [] }),
  getHistory: (req, res) => res.json({ elderId: req.params.elderId, items: [] }),
  getTrendSummary: (req, res) => res.json({ elderId: req.params.elderId, trend: 'stable' }),
}));

jest.mock('../../src/controllers/activityController', () => ({
  getNextActivity: (req, res) => res.json({ activity: { elderId: req.params.elderId } }),
  submitActivityAttempt: (req, res) => res.status(201).json({ attempt: { activityId: req.params.activityId } }),
}));

jest.mock('../../src/controllers/caregiverController', () => ({
  getCaregiverElders: (req, res) => res.json({ caregiverId: req.params.caregiverId, elders: [] }),
  getCaregiverElderDetail: (req, res) => res.json({ caregiverId: req.params.caregiverId, elderId: req.params.elderId }),
}));

jest.mock('../../src/controllers/alertController', () => ({
  getCaregiverAlerts: (req, res) => res.json({ caregiverId: req.params.caregiverId, alerts: [] }),
  acknowledgeAlert: (req, res) => res.json({ alertId: req.params.alertId, acknowledged: true }),
}));

jest.mock('../../src/controllers/narrativeController', () => ({
  processNarrative: (req, res) => res.json({ detectedEmotionalState: 'neutral' }),
}));

jest.mock('../../src/controllers/moodCheckinController', () => ({
  createMoodCheckin: (req, res) => res.status(201).json({ mood: req.body?.mood || 'neutral' }),
}));

jest.mock('../../src/controllers/emotionalTrendController', () => ({
  getUserTrends: (req, res) => res.json({ userId: req.params.userId, trends: [] }),
}));

jest.mock('../../src/controllers/adaptiveQuestionBankController', () => ({
  getNextAdaptiveQuestion: (req, res) => res.json({ question: { question_id: 1 } }),
}));

jest.mock('../../src/controllers/adaptiveChatController', () => ({
  startAdaptiveChat: (req, res) => res.status(201).json({ success: true, session_id: 'adaptive-1' }),
  respondAdaptiveChat: (req, res) => res.json({ success: true, session_id: req.body?.session_id, is_complete: false }),
}));

jest.mock('../../src/controllers/activityExecutionController', () => ({
  startActivity: (req, res) => res.status(201).json({ success: true, attempt_id: 'attempt-1' }),
  listCognitiveActivities: (req, res) => res.json({ success: true, count: 0, activities: [] }),
  submitActivity: (req, res) => res.json({ success: true, attempt_id: req.params.attemptId }),
}));

jest.mock('../../src/controllers/wellnessTrendController', () => ({
  getWellnessTrends: (req, res) => res.json({ userId: req.params.userId, trends: [] }),
  getWellnessSummary: (req, res) => res.json({ userId: req.params.userId, summary: 'stable' }),
}));

jest.mock('../../src/controllers/adaptiveCaregiverAlertController', () => ({
  listUserCaregiverAlerts: (req, res) => res.json({ userId: req.params.userId, alerts: [] }),
}));

jest.mock('../../src/controllers/reminiscenceMemoryController', () => ({
  previewTopic: (req, res) => res.json({ preview: true }),
  saveTopic: (req, res) => res.status(201).json({ topic: { id: 1 } }),
  listTopics: (req, res) => res.json({ userId: req.params.userId, topics: [] }),
  clearTopics: (req, res) => res.json({ userId: req.params.userId, cleared: true }),
  deleteTopic: (req, res) => res.json({ topicId: req.params.topicId, deleted: true }),
  getPrompt: (req, res) => res.json({ userId: req.params.userId, prompt: 'Tell me about a happy memory.' }),
  createEntry: (req, res) => res.status(201).json({ entry: { id: 1 } }),
  listEntries: (req, res) => res.json({ userId: req.params.userId, entries: [] }),
  deleteEntry: (req, res) => res.json({ entryId: req.params.entryId, deleted: true }),
}));

jest.mock('../../src/services/assistantOrchestrator', () => ({
  handleChat: jest.fn(async () => ({ conversationId: 1, answer: 'Assistant response' })),
  listConversations: jest.fn(async () => []),
  listMessages: jest.fn(async () => []),
  renameConversation: jest.fn(async (_userId, id, title) => ({ id, title })),
  deleteConversation: jest.fn(async (_userId, id) => ({ deleted: true, id })),
}));

jest.mock('../../src/services/assistantSummaryService', () => ({
  buildSummary: jest.fn(async () => ({ medicationCount: 0, riskSummary: [] })),
}));

jest.mock('../../src/services/healthAdviceService', () => ({
  buildHealthAdviceResponse: jest.fn(async () => ({
    answer: 'Health advice response',
    riskType: 'Stroke',
    prediction: { riskLevel: 'Low' },
    sources: [],
    safetyNote: 'This is not a diagnosis.',
    conversationId: 1,
    fallback: false,
    followUps: [],
  })),
}));

jest.mock('../../src/services/diabetesPredictionService', () => ({
  PHASE_ONE_ADVICE_MESSAGE: 'Diabetes phase one advice placeholder',
  isAdviceRequest: jest.fn(() => false),
  getExistingHealthInputs: jest.fn(async () => ({ user: { id: 42 }, health: {} })),
  saveOrUpdateHealthValues: jest.fn(async () => ({})),
  extractHealthValuesFromMessage: jest.fn(() => ({ bloodSugar: 160 })),
  saveHealthChatHistory: jest.fn(async () => 1),
  buildDiabetesResponseWithSummary: jest.fn(async () => ({
    conversationId: 1,
    riskType: 'Diabetes',
    riskLevel: 'Low',
    confidence: 80,
    selectedAlgorithm: 'Mock',
    factors: [],
    summary: 'Low diabetes risk.',
  })),
}));

jest.mock('../../src/services/strokePredictionService', () => ({
  PHASE_ONE_STROKE_ADVICE_MESSAGE: 'Stroke phase one advice placeholder',
  isStrokeAdviceRequest: jest.fn(() => false),
  getExistingStrokeInputs: jest.fn(async () => ({ user: { id: 42 }, health: {} })),
  extractStrokeValuesFromMessage: jest.fn(() => ({ systolicBP: 140, diastolicBP: 90 })),
  saveStrokeChatHistory: jest.fn(async () => 1),
  buildStrokeResponseWithSummary: jest.fn(async () => ({
    conversationId: 1,
    riskType: 'Stroke',
    riskLevel: 'Medium',
    confidence: 82,
    selectedAlgorithm: 'Mock',
    factors: ['blood pressure'],
    summary: 'Medium stroke risk.',
  })),
}));

jest.mock('../../src/services/hypertensionPredictionService', () => ({
  PHASE_ONE_HYPERTENSION_ADVICE_MESSAGE: 'Hypertension phase one advice placeholder',
  isHypertensionAdviceRequest: jest.fn(() => false),
  getExistingHypertensionInputs: jest.fn(async () => ({ user: { id: 42 }, health: {} })),
  extractHypertensionValuesFromMessage: jest.fn(() => ({ systolicBP: 140, diastolicBP: 90 })),
  saveHypertensionChatHistory: jest.fn(async () => 1),
  buildHypertensionResponseWithSummary: jest.fn(async () => ({
    conversationId: 1,
    riskType: 'Hypertension',
    riskLevel: 'Medium',
    confidence: 82,
    selectedAlgorithm: 'Mock',
    factors: ['blood pressure'],
    summary: 'Medium hypertension risk.',
  })),
}));

const authRoutes = require('../../src/routes/auth');
const userRoutes = require('../../src/routes/users');
const medicationRoutes = require('../../src/routes/medications');
const routineRoutes = require('../../src/routes/routines');
const intakeMonitoringRoutes = require('../../src/routes/intakeMonitoring');
const allergyRoutes = require('../../src/routes/allergies');
const prescriptionRoutes = require('../../src/routes/prescriptions');
const emotionalSupportRoutes = require('../../src/routes/emotionalSupportRoutes');
const assistantRoutes = require('../../src/routes/assistant');
const predictRoutes = require('../../src/routes/predict');
const healthAdviceRoutes = require('../../src/routes/healthAdvice');

const buildApp = () => {
  const app = express();
  app.use(express.json({ limit: '35mb' }));
  app.get('/api/health', (req, res) => res.json({ status: 'Server is running' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/medications', medicationRoutes);
  app.use('/api/routines', routineRoutes);
  app.use('/api/intake-monitoring', intakeMonitoringRoutes);
  app.use('/api/allergies', allergyRoutes);
  app.use('/api/prescriptions', prescriptionRoutes);
  app.use('/api/emotional-support', emotionalSupportRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/predict', predictRoutes);
  app.use('/api/health-advice', healthAdviceRoutes);
  return app;
};

describe('system route integration coverage', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test.each([
    ['health', 'GET', '/api/health', undefined, 200, 'status'],
    ['auth', 'POST', '/api/auth/register', {}, 400, 'error'],
    ['users', 'GET', '/api/users/me', undefined, 200, 'user'],
    ['medications', 'GET', '/api/medications/suggestions?q=', undefined, 200, 'suggestions'],
    ['medication validation', 'POST', '/api/medications', {}, 400, 'error'],
    ['routines', 'GET', '/api/routines', undefined, 200, 'mealTimes'],
    ['intake palm validation', 'POST', '/api/intake-monitoring/analyze-palm', {}, 400, 'error'],
    ['intake motion validation', 'POST', '/api/intake-monitoring/analyze-motion', {}, 400, 'error'],
    ['allergies', 'GET', '/api/allergies/profile', undefined, 200, 'profile'],
    ['prescriptions', 'GET', '/api/prescriptions/suggestions?q=pa', undefined, 200, 'suggestions'],
    ['emotional support', 'POST', '/api/emotional-support/adaptive-chat/start', { user_id: 42 }, 201, 'session_id'],
    ['assistant', 'GET', '/api/assistant/summary', undefined, 200, 'medicationCount'],
    ['predict', 'GET', '/api/predict/stroke/context', undefined, 200, 'health'],
    ['health advice', 'POST', '/api/health-advice', { question: 'What should I monitor?', riskType: 'Stroke' }, 200, 'answer'],
  ])('%s route responds with its expected contract', async (_name, method, path, body, status, key) => {
    const response = await requestJson(buildApp(), { method, path, body });

    expect(response.status).toBe(status);
    expect(response.body).toHaveProperty(key);
  });
});
