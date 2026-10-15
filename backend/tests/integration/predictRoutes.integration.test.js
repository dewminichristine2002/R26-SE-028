const express = require('express');
const { requestJson } = require('../helpers/httpTestClient');

jest.mock('../../src/middleware/databaseMiddleware', () => ({
  requireDatabase: (req, res, next) => next(),
}));

jest.mock('../../src/middleware/authMiddleware', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 42, role: 'caregiver' };
    next();
  },
}));

jest.mock('../../src/services/diabetesPredictionService', () => ({
  PHASE_ONE_ADVICE_MESSAGE: 'Diabetes phase one advice placeholder',
  isAdviceRequest: jest.fn(),
  getExistingHealthInputs: jest.fn(),
  saveOrUpdateHealthValues: jest.fn(),
  extractHealthValuesFromMessage: jest.fn(),
  saveHealthChatHistory: jest.fn(),
  buildDiabetesResponseWithSummary: jest.fn(),
}));

jest.mock('../../src/services/strokePredictionService', () => ({
  PHASE_ONE_STROKE_ADVICE_MESSAGE: 'Stroke phase one advice placeholder',
  isStrokeAdviceRequest: jest.fn(),
  getExistingStrokeInputs: jest.fn(),
  extractStrokeValuesFromMessage: jest.fn(),
  saveStrokeChatHistory: jest.fn(),
  buildStrokeResponseWithSummary: jest.fn(),
}));

jest.mock('../../src/services/hypertensionPredictionService', () => ({
  PHASE_ONE_HYPERTENSION_ADVICE_MESSAGE: 'Hypertension phase one advice placeholder',
  isHypertensionAdviceRequest: jest.fn(),
  getExistingHypertensionInputs: jest.fn(),
  extractHypertensionValuesFromMessage: jest.fn(),
  saveHypertensionChatHistory: jest.fn(),
  buildHypertensionResponseWithSummary: jest.fn(),
}));

jest.mock('../../src/services/healthAdviceService', () => ({
  buildHealthAdviceResponse: jest.fn(),
}));

const diabetesService = require('../../src/services/diabetesPredictionService');
const strokeService = require('../../src/services/strokePredictionService');
const hypertensionService = require('../../src/services/hypertensionPredictionService');
const { buildHealthAdviceResponse } = require('../../src/services/healthAdviceService');
const predictRoutes = require('../../src/routes/predict');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/predict', predictRoutes);
  return app;
};

describe('predict routes integration', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('rejects empty stroke chat messages before calling prediction services', async () => {
    const response = await requestJson(buildApp(), {
      method: 'POST',
      path: '/api/predict/stroke/chat',
      body: { message: '   ' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'message is required' });
    expect(strokeService.buildStrokeResponseWithSummary).not.toHaveBeenCalled();
  });

  test('routes stroke advice questions to health advice instead of prediction', async () => {
    strokeService.isStrokeAdviceRequest.mockReturnValue(true);
    buildHealthAdviceResponse.mockResolvedValue({
      conversationId: 77,
      answer: 'Keep monitoring symptoms and talk with your clinician.',
      sources: [{ title: 'Stroke education' }],
      safetyNote: 'Emergency symptoms require urgent medical help.',
    });

    const response = await requestJson(buildApp(), {
      method: 'POST',
      path: '/api/predict/stroke/chat',
      body: { message: 'How can I reduce my stroke risk?', latestPrediction: { riskLevel: 'High' } },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      conversationId: 77,
      reply: 'Keep monitoring symptoms and talk with your clinician.',
      shouldPredict: false,
      updatedValues: {},
    });
    expect(buildHealthAdviceResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        userRole: 'caregiver',
        riskType: 'Stroke',
      })
    );
    expect(strokeService.buildStrokeResponseWithSummary).not.toHaveBeenCalled();
  });

  test('routes stroke vital updates to prediction and returns the frontend chat contract', async () => {
    strokeService.isStrokeAdviceRequest.mockReturnValue(false);
    strokeService.extractStrokeValuesFromMessage.mockReturnValue({
      systolicBP: 150,
      diastolicBP: 92,
      bloodSugar: 166,
    });
    strokeService.buildStrokeResponseWithSummary.mockResolvedValue({
      conversationId: 88,
      riskType: 'Stroke',
      riskLevel: 'Medium',
      confidence: 83,
      selectedAlgorithm: 'XGBoost',
      factors: ['blood pressure'],
      summary: 'Medium stroke risk awareness summary.',
    });

    const response = await requestJson(buildApp(), {
      method: 'POST',
      path: '/api/predict/stroke/chat',
      body: { message: 'My BP is 150 over 92 and sugar is 166' },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      conversationId: 88,
      reply: 'Medium stroke risk awareness summary.',
      shouldPredict: true,
      updatedValues: {
        systolicBP: 150,
        diastolicBP: 92,
        bloodSugar: 166,
      },
      prediction: {
        riskType: 'Stroke',
        riskLevel: 'Medium',
        confidence: 83,
        selectedAlgorithm: 'XGBoost',
      },
    });
    expect(strokeService.buildStrokeResponseWithSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        userRole: 'caregiver',
        values: {
          systolicBP: 150,
          diastolicBP: 92,
          bloodSugar: 166,
        },
        userMessage: 'My BP is 150 over 92 and sugar is 166',
      })
    );
  });

  test('passes direct diabetes prediction errors back with the service status', async () => {
    const error = new Error('diabetes artifacts are missing');
    error.status = 503;
    diabetesService.buildDiabetesResponseWithSummary.mockRejectedValue(error);

    const response = await requestJson(buildApp(), {
      method: 'POST',
      path: '/api/predict/diabetes',
      body: { age: 68, bloodSugar: 210 },
    });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'diabetes artifacts are missing' });
  });

  test('loads hypertension context for the authenticated user', async () => {
    hypertensionService.getExistingHypertensionInputs.mockResolvedValue({
      user: { id: 42, fullName: 'Test Elder' },
      health: { systolicBP: 138, diastolicBP: 86 },
    });

    const response = await requestJson(buildApp(), {
      method: 'GET',
      path: '/api/predict/hypertension/context',
    });

    expect(response.status).toBe(200);
    expect(response.body.health).toMatchObject({ systolicBP: 138, diastolicBP: 86 });
    expect(hypertensionService.getExistingHypertensionInputs).toHaveBeenCalledWith(42);
  });
});
