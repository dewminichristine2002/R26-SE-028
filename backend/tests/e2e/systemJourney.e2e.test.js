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
              full_name: 'Whole System Elder',
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
    req.user = { id: 42, role: 'user' };
    next();
  },
}));

jest.mock('../../src/models/routineModel', () => ({
  getRoutine: jest.fn(async () => ({
    id: 1,
    mealTimes: { breakfast: '08:00 AM', lunch: '01:00 PM', dinner: '07:00 PM', sleep: '10:30 PM' },
  })),
  saveRoutine: jest.fn(async (_userId, mealTimes) => ({ id: 1, mealTimes })),
}));

jest.mock('../../src/controllers/allergyController', () => ({
  fetchProfile: (req, res) => res.json({ profile: { userId: req.user.id, chronicDiseases: [] } }),
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
  getNextActivity: (req, res) => res.json({ activity: { code: 'breathing' } }),
  submitActivityAttempt: (req, res) => res.status(201).json({ attempt: { id: 1 } }),
}));

jest.mock('../../src/controllers/caregiverController', () => ({
  getCaregiverElders: (req, res) => res.json({ elders: [] }),
  getCaregiverElderDetail: (req, res) => res.json({ elderId: req.params.elderId }),
}));

jest.mock('../../src/controllers/alertController', () => ({
  getCaregiverAlerts: (req, res) => res.json({ alerts: [] }),
  acknowledgeAlert: (req, res) => res.json({ acknowledged: true }),
}));

jest.mock('../../src/controllers/narrativeController', () => ({
  processNarrative: (req, res) => res.json({ detectedEmotionalState: 'neutral' }),
}));

jest.mock('../../src/controllers/moodCheckinController', () => ({
  createMoodCheckin: (req, res) => res.status(201).json({ mood: req.body?.mood || 'neutral' }),
}));

jest.mock('../../src/controllers/emotionalTrendController', () => ({
  getUserTrends: (req, res) => res.json({ trends: [] }),
}));

jest.mock('../../src/controllers/adaptiveQuestionBankController', () => ({
  getNextAdaptiveQuestion: (req, res) => res.json({ question: { question_id: 1 } }),
}));

jest.mock('../../src/controllers/adaptiveChatController', () => ({
  startAdaptiveChat: (req, res) => res.status(201).json({ success: true, session_id: 'adaptive-1' }),
  respondAdaptiveChat: (req, res) => res.json({ success: true, session_id: req.body?.session_id, is_complete: true }),
}));

jest.mock('../../src/controllers/activityExecutionController', () => ({
  startActivity: (req, res) => res.status(201).json({ success: true, attempt_id: 'attempt-1' }),
  listCognitiveActivities: (req, res) => res.json({ success: true, count: 1, activities: [{ activity_code: 'word_category' }] }),
  submitActivity: (req, res) => res.json({ success: true, attempt_id: req.params.attemptId }),
}));

jest.mock('../../src/controllers/wellnessTrendController', () => ({
  getWellnessTrends: (req, res) => res.json({ trends: [] }),
  getWellnessSummary: (req, res) => res.json({ summary: 'stable' }),
}));

jest.mock('../../src/controllers/adaptiveCaregiverAlertController', () => ({
  listUserCaregiverAlerts: (req, res) => res.json({ alerts: [] }),
}));

jest.mock('../../src/controllers/reminiscenceMemoryController', () => ({
  previewTopic: (req, res) => res.json({ preview: true }),
  saveTopic: (req, res) => res.status(201).json({ topic: { id: 1 } }),
  listTopics: (req, res) => res.json({ topics: [] }),
  clearTopics: (req, res) => res.json({ cleared: true }),
  deleteTopic: (req, res) => res.json({ deleted: true }),
  getPrompt: (req, res) => res.json({ prompt: 'Tell me about a happy memory.' }),
  createEntry: (req, res) => res.status(201).json({ entry: { id: 1 } }),
  listEntries: (req, res) => res.json({ entries: [] }),
  deleteEntry: (req, res) => res.json({ deleted: true }),
}));

jest.mock('../../src/services/assistantOrchestrator', () => ({
  handleChat: jest.fn(async () => ({ conversationId: 100, answer: 'Medication and mood summary ready.' })),
  listConversations: jest.fn(async () => [{ id: 100, title: 'Today' }]),
  listMessages: jest.fn(async () => [{ role: 'assistant', content: 'Hello' }]),
  renameConversation: jest.fn(async (_userId, id, title) => ({ id, title })),
  deleteConversation: jest.fn(async (_userId, id) => ({ deleted: true, id })),
}));

jest.mock('../../src/services/assistantSummaryService', () => ({
  buildSummary: jest.fn(async () => ({ medicationCount: 1, riskSummary: [{ riskType: 'Stroke', riskLevel: 'Medium' }] })),
}));

jest.mock('../../src/services/healthAdviceService', () => ({
  buildHealthAdviceResponse: jest.fn(async () => ({
    answer: 'Monitor symptoms and contact a clinician for personalised care.',
    riskType: 'Stroke',
    prediction: { riskLevel: 'Medium' },
    sources: [],
    safetyNote: 'This is not a diagnosis.',
    conversationId: 100,
    fallback: false,
    followUps: [],
  })),
}));

jest.mock('../../src/services/diabetesPredictionService', () => ({
  PHASE_ONE_ADVICE_MESSAGE: 'Diabetes phase one advice placeholder',
  isAdviceRequest: jest.fn(() => false),
  getExistingHealthInputs: jest.fn(async () => ({ user: { id: 42 }, health: { bloodSugar: 150 } })),
  saveOrUpdateHealthValues: jest.fn(async () => ({})),
  extractHealthValuesFromMessage: jest.fn(() => ({ bloodSugar: 150 })),
  saveHealthChatHistory: jest.fn(async () => 100),
  buildDiabetesResponseWithSummary: jest.fn(async () => ({
    conversationId: 100,
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
  getExistingStrokeInputs: jest.fn(async () => ({ user: { id: 42 }, health: { systolicBP: 140 } })),
  extractStrokeValuesFromMessage: jest.fn(() => ({ systolicBP: 150, diastolicBP: 92 })),
  saveStrokeChatHistory: jest.fn(async () => 100),
  buildStrokeResponseWithSummary: jest.fn(async () => ({
    conversationId: 100,
    riskType: 'Stroke',
    riskLevel: 'Medium',
    confidence: 84,
    selectedAlgorithm: 'Mock',
    factors: ['blood pressure'],
    summary: 'Medium stroke risk. This is not a medical diagnosis.',
  })),
}));

jest.mock('../../src/services/hypertensionPredictionService', () => ({
  PHASE_ONE_HYPERTENSION_ADVICE_MESSAGE: 'Hypertension phase one advice placeholder',
  isHypertensionAdviceRequest: jest.fn(() => false),
  getExistingHypertensionInputs: jest.fn(async () => ({ user: { id: 42 }, health: { systolicBP: 140 } })),
  extractHypertensionValuesFromMessage: jest.fn(() => ({ systolicBP: 150, diastolicBP: 92 })),
  saveHypertensionChatHistory: jest.fn(async () => 100),
  buildHypertensionResponseWithSummary: jest.fn(async () => ({
    conversationId: 100,
    riskType: 'Hypertension',
    riskLevel: 'Medium',
    confidence: 84,
    selectedAlgorithm: 'Mock',
    factors: ['blood pressure'],
    summary: 'Medium hypertension risk.',
  })),
}));

const routineRoutes = require('../../src/routes/routines');
const authRoutes = require('../../src/routes/auth');
const userRoutes = require('../../src/routes/users');
const medicationRoutes = require('../../src/routes/medications');
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

describe('system E2E journey coverage', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('moves through the whole backend system surface over HTTP with stable contracts', async () => {
    const app = buildApp();
    const steps = [
      requestJson(app, { method: 'GET', path: '/api/health' }),
      requestJson(app, { method: 'POST', path: '/api/auth/register', body: {} }),
      requestJson(app, { method: 'GET', path: '/api/users/me' }),
      requestJson(app, { method: 'GET', path: '/api/medications/suggestions?q=' }),
      requestJson(app, { method: 'POST', path: '/api/medications', body: {} }),
      requestJson(app, { method: 'GET', path: '/api/routines' }),
      requestJson(app, { method: 'POST', path: '/api/routines', body: { mealTimes: { breakfast: '07:30 AM', lunch: '12:30 PM', dinner: '06:30 PM', sleep: '10:00 PM' } } }),
      requestJson(app, { method: 'POST', path: '/api/intake-monitoring/analyze-palm', body: {} }),
      requestJson(app, { method: 'POST', path: '/api/intake-monitoring/analyze-motion', body: {} }),
      requestJson(app, { method: 'GET', path: '/api/allergies/profile' }),
      requestJson(app, { method: 'GET', path: '/api/prescriptions/suggestions?q=pa' }),
      requestJson(app, { method: 'POST', path: '/api/emotional-support/check-ins', body: { elderId: 42, inputMode: 'text', checkInType: 'daily', text: 'I feel okay today' } }),
      requestJson(app, { method: 'POST', path: '/api/emotional-support/adaptive-chat/start', body: { user_id: 42 } }),
      requestJson(app, { method: 'GET', path: '/api/emotional-support/cognitive-activities?user_id=42' }),
      requestJson(app, { method: 'POST', path: '/api/predict/stroke/chat', body: { message: 'My BP is 150 over 92, check my stroke risk' } }),
      requestJson(app, { method: 'POST', path: '/api/health-advice', body: { question: 'What should I monitor?', riskType: 'Stroke' } }),
      requestJson(app, { method: 'GET', path: '/api/assistant/summary' }),
      requestJson(app, { method: 'POST', path: '/api/assistant/chat', body: { message: 'Summarize my care plan' } }),
    ];

    const responses = await Promise.all(steps);

    expect(responses.map((response) => response.status)).toEqual([
      200,
      400,
      200,
      200,
      400,
      200,
      200,
      400,
      400,
      200,
      200,
      201,
      201,
      200,
      200,
      200,
      200,
      200,
    ]);
    expect(responses[0].body).toHaveProperty('status');
    expect(responses[1].body).toHaveProperty('error');
    expect(responses[2].body.user).toMatchObject({ id: 42, email: 'elder@example.com' });
    expect(responses[3].body).toHaveProperty('suggestions');
    expect(responses[4].body).toHaveProperty('error');
    expect(responses[6].body.mealTimes.breakfast).toBe('07:30 AM');
    expect(responses[7].body.error).toContain('palm photo');
    expect(responses[8].body.error).toContain('Motion landmark frames');
    expect(responses[9].body).toHaveProperty('profile');
    expect(responses[10].body).toHaveProperty('suggestions');
    expect(responses[11].body).toHaveProperty('riskLevel');
    expect(responses[14].body.prediction).toMatchObject({ riskType: 'Stroke', riskLevel: 'Medium' });
    expect(responses[15].body).toHaveProperty('safetyNote');
    expect(responses[17].body.answer).toContain('summary');
  });
});
