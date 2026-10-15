jest.mock('axios', () => ({
  post: jest.fn(),
}));

jest.mock('../../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../../src/services/mlServiceManager', () => ({
  ensureMlServiceAvailable: jest.fn(),
}));

const axios = require('axios');
const { ensureMlServiceAvailable } = require('../../../src/services/mlServiceManager');
const {
  callStrokePredictionService,
  extractStrokeValuesFromMessage,
  generateStrokeSummaryWithLLM,
  isStrokeAdviceRequest,
} = require('../../../src/services/strokePredictionService');

describe('stroke prediction service unit behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('extracts stroke-relevant vitals and history from natural language', () => {
    const values = extractStrokeValuesFromMessage(
      'My BP is 152 over 96, sugar is 178, height is 165 cm, weight is 72 kg. I have hypertension and heart disease.'
    );

    expect(values).toMatchObject({
      systolicBP: 152,
      diastolicBP: 96,
      bloodSugar: 178,
      height: 165,
      weight: 72,
      hypertension: 'Yes',
      heartDisease: 'Yes',
    });
    expect(values.existingDiseaseHistory).toEqual(
      expect.arrayContaining(['hypertension', 'heart disease'])
    );
  });

  test('detects advice requests separately from prediction updates', () => {
    expect(isStrokeAdviceRequest('How can I reduce my stroke risk?')).toBe(true);
    expect(isStrokeAdviceRequest('What should we monitor as caregivers?')).toBe(true);
    expect(isStrokeAdviceRequest('My BP is 140 over 90')).toBe(false);
  });

  test('calls the configured ML stroke endpoint after availability check', async () => {
    ensureMlServiceAvailable.mockResolvedValue();
    axios.post.mockResolvedValue({
      data: {
        riskType: 'Stroke',
        riskLevel: 'High',
        confidence: 91,
        selectedAlgorithm: 'XGBoost',
        factors: ['blood pressure'],
      },
    });

    const payload = { age: 72, systolicBP: 152, diastolicBP: 96 };
    const result = await callStrokePredictionService(payload);

    expect(ensureMlServiceAvailable).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:8001/predict/stroke',
      payload,
      { timeout: 60000 }
    );
    expect(result.riskLevel).toBe('High');
  });

  test('uses a safe local summary when the LLM explanation service is unavailable', async () => {
    axios.post.mockRejectedValue(new Error('assistant unavailable'));

    const summary = await generateStrokeSummaryWithLLM(
      {
        riskType: 'Stroke',
        riskLevel: 'Medium',
        confidence: 77,
        selectedAlgorithm: 'RandomForest',
        factors: ['blood pressure', 'glucose'],
      },
      'user'
    );

    expect(summary).toContain('medium stroke risk');
    expect(summary).toContain('blood pressure, glucose');
    expect(summary).toContain('not a medical diagnosis');
  });
});
