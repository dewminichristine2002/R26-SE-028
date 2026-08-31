const express = require('express');
const jwt = require('jsonwebtoken');
const { requestJson } = require('../helpers/httpTestClient');

jest.mock('axios', () => ({
  post: jest.fn(),
}));

const mockQueryLog = [];

const mockTableExists = (tableName) =>
  ['user_health_profiles', 'stroke_risk_predictions'].includes(tableName);

const mockQuery = jest.fn(async (sql, params = []) => {
  mockQueryLog.push({ sql, params });
  const normalized = String(sql).replace(/\s+/g, ' ').trim();

  if (normalized.includes('information_schema.tables')) {
    return { rows: mockTableExists(params[0]) ? [{ '?column?': 1 }] : [] };
  }

  if (normalized.startsWith('SELECT id, date_of_birth, full_name FROM users')) {
    return {
      rows: [
        {
          id: params[0],
          date_of_birth: '1952-04-12',
          full_name: 'Mary Perera',
        },
      ],
    };
  }

  if (normalized.includes('FROM user_health_profiles WHERE user_id')) {
    return {
      rows: [
        {
          age: 73,
          gender: 'Female',
          bloodSugar: 145,
          systolicBP: 138,
          diastolicBP: 84,
          height: 160,
          weight: 66,
          smokingStatus: 'No',
          physicalActivityLevel: 'Medium',
          familyHistory: 'No',
          existingDiseaseHistory: [],
        },
      ],
    };
  }

  if (normalized.includes('FROM stroke_risk_predictions WHERE user_id')) {
    return { rows: [] };
  }

  if (normalized.startsWith('INSERT INTO user_health_profiles')) {
    return {
      rows: [
        {
          age: params[1],
          gender: params[2],
          bloodSugar: params[3],
          systolicBP: params[4],
          diastolicBP: params[5],
          height: params[6],
          weight: params[7],
          smokingStatus: params[8],
          physicalActivityLevel: params[9],
          familyHistory: params[10],
          existingDiseaseHistory: params[11],
        },
      ],
    };
  }

  if (normalized.includes('FROM assistant_conversations')) {
    return { rows: [] };
  }

  if (normalized.startsWith('INSERT INTO assistant_conversations')) {
    return { rows: [{ id: 501 }] };
  }

  if (normalized.startsWith('INSERT INTO assistant_messages')) {
    return { rows: [] };
  }

  if (normalized.startsWith('UPDATE assistant_conversations')) {
    return { rows: [] };
  }

  if (normalized.startsWith('INSERT INTO stroke_risk_predictions')) {
    return {
      rows: [
        {
          id: 901,
          riskType: params[1],
          riskLevel: params[2],
          confidence: params[3],
          probability: params[4],
          selectedAlgorithm: params[5],
          factors: JSON.parse(params[6]),
          summary: params[8],
          createdAt: '2026-08-31T00:00:00.000Z',
        },
      ],
    };
  }

  return { rows: [] };
});

jest.mock('../../src/config/db', () => ({
  pool: {
    query: mockQuery,
  },
  getPublicDatabaseStatus: () => ({ connected: true, lastAttemptAt: '2026-08-31T00:00:00.000Z', lastError: null }),
}));

jest.mock('../../src/services/mlServiceManager', () => ({
  ensureMlServiceAvailable: jest.fn().mockResolvedValue(undefined),
}));

const axios = require('axios');
const predictRoutes = require('../../src/routes/predict');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/predict', predictRoutes);
  return app;
};

describe('prediction chat E2E flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryLog.length = 0;
    process.env.JWT_SECRET = 'e2e-test-secret';
    axios.post.mockImplementation(async (url) => {
      if (url.endsWith('/predict/stroke')) {
        return {
          data: {
            riskType: 'Stroke',
            riskLevel: 'High',
            confidence: 92,
            probability: 0.81,
            selectedAlgorithm: 'XGBoost',
            factors: ['blood pressure', 'heart disease'],
          },
        };
      }

      if (url.endsWith('/assistant/answer')) {
        return {
          data: {
            answer: 'Your recent values point to higher stroke risk and should be reviewed with a clinician.',
          },
        };
      }

      throw new Error(`Unexpected ML URL: ${url}`);
    });
  });

  test('runs an authenticated elder stroke-risk chat from HTTP request to saved prediction response', async () => {
    const token = jwt.sign({ userId: 42, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '5m' });

    const response = await requestJson(buildApp(), {
      method: 'POST',
      path: '/api/predict/stroke/chat',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: {
        message: 'Please check my stroke risk. My BP is 156 over 98, sugar is 178, and I have heart disease.',
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      conversationId: 501,
      shouldPredict: true,
      updatedValues: {
        systolicBP: 156,
        diastolicBP: 98,
        bloodSugar: 178,
        heartDisease: 'Yes',
      },
      prediction: {
        riskType: 'Stroke',
        riskLevel: 'High',
        confidence: 92,
        selectedAlgorithm: 'XGBoost',
      },
    });
    expect(response.body.reply).toContain('not a medical diagnosis');
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:8001/predict/stroke',
      expect.objectContaining({
        age: 73,
        systolicBP: 156,
        diastolicBP: 98,
        avgGlucoseLevel: 178,
        heartDisease: 'Yes',
        bmi: expect.any(Number),
      }),
      { timeout: 60000 }
    );
    expect(mockQueryLog.some((entry) => String(entry.sql).includes('INSERT INTO assistant_messages'))).toBe(true);
    expect(mockQueryLog.some((entry) => String(entry.sql).includes('INSERT INTO stroke_risk_predictions'))).toBe(true);
  });
});
