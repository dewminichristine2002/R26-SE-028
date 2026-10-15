const { performance } = require('perf_hooks');

jest.mock('axios', () => ({
  post: jest.fn(),
}));

jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
  getPublicDatabaseStatus: jest.fn(),
}));

jest.mock('../../src/services/mlServiceManager', () => ({
  ensureMlServiceAvailable: jest.fn(),
}));

const axios = require('axios');
const db = require('../../src/config/db');
const {
  generateDiabetesSummaryWithLLM,
  normalizeMlServiceError,
} = require('../../src/services/diabetesPredictionService');
const {
  extractStrokeValuesFromMessage,
  generateStrokeSummaryWithLLM,
} = require('../../src/services/strokePredictionService');
const { requireAuth } = require('../../src/middleware/authMiddleware');
const { requireDatabase } = require('../../src/middleware/databaseMiddleware');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

describe('prediction workflow non-functional requirements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('performance: deterministic stroke text parsing stays under the chat latency budget', () => {
    const started = performance.now();

    for (let i = 0; i < 1000; i += 1) {
      extractStrokeValuesFromMessage(
        `BP is ${130 + (i % 20)} over ${80 + (i % 10)}, sugar is ${140 + (i % 30)}, weight is 70 kg`
      );
    }

    expect(performance.now() - started).toBeLessThan(250);
  });

  test('reliability: stroke explanation falls back when the LLM dependency fails', async () => {
    axios.post.mockRejectedValue(new Error('timeout'));

    const summary = await generateStrokeSummaryWithLLM({
      riskType: 'Stroke',
      riskLevel: 'High',
      confidence: 86,
      selectedAlgorithm: 'XGBoost',
      factors: ['blood pressure'],
    });

    expect(summary).toContain('high stroke risk');
    expect(summary).toContain('not a medical diagnosis');
  });

  test('usability: generated risk summaries use plain, actionable wording with safety context', async () => {
    const summary = await generateDiabetesSummaryWithLLM({
      riskType: 'Diabetes',
      riskLevel: 'Low',
      confidence: 73,
      selectedAlgorithm: 'LogisticRegression',
      factors: ['overall health indicators'],
    });

    expect(summary).toContain('health risk awareness only');
    expect(summary).toContain('main contributing factors');
    expect(summary).toContain('not a medical diagnosis');
  });

  test('usability: ML validation errors are normalized into readable messages', () => {
    const error = normalizeMlServiceError(
      {
        response: {
          status: 422,
          data: {
            detail: [
              { msg: 'age must be greater than 0' },
              { msg: 'blood sugar is required' },
            ],
          },
        },
      },
      'Prediction failed'
    );

    expect(error.status).toBe(422);
    expect(error.message).toBe('age must be greater than 0; blood sugar is required');
  });

  test('security: protected endpoints reject requests without a bearer token', () => {
    const req = { headers: {} };
    const res = response();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Authorization token is required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('reliability: database-backed endpoints return 503 when the database is unavailable', () => {
    db.getPublicDatabaseStatus.mockReturnValue({
      connected: false,
      lastAttemptAt: '2026-08-31T00:00:00.000Z',
      lastError: 'Database connection failed.',
    });
    const req = {};
    const res = response();
    const next = jest.fn();

    requireDatabase(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toContain('Database unavailable');
    expect(next).not.toHaveBeenCalled();
  });
});
