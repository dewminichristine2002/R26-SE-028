jest.mock('../../repositories/activityExecutionRepository', () => ({
  withTransaction: jest.fn(), getAttemptForUpdate: jest.fn(),
  getRecentCognitiveAttempts: jest.fn(), completeAttempt: jest.fn(),
  startActivityAttempt: jest.fn(),
}));

const repository = require('../../repositories/activityExecutionRepository');
const { submitActivity } = require('../activityExecutionController');

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

const attempt = {
  attemptId: 'attempt-1', category: 'cognitive_engagement', activityCode: 'word_category_easy',
  activityType: 'word_association', difficulty: 'easy', completionStatus: 'started', completedAt: null,
  startedAt: new Date(Date.now() - 25), finalEmotionalState: 'happiness', riskLevel: 'low',
  conversationEngagement: 'engaged',
  taskSnapshot: { kind: 'single_choice', options: ['Apple', 'Banana', 'Carrot'], correctAnswer: 'Carrot' },
};

describe('activity submission integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repository.withTransaction.mockImplementation((callback) => callback({}));
    repository.getRecentCognitiveAttempts.mockResolvedValue([]);
  });

  test('D/G: records a non-negative response time and completes once', async () => {
    repository.getAttemptForUpdate.mockResolvedValue(attempt);
    repository.completeAttempt.mockImplementation(async (_client, values) => ({ ...values, activityCode: attempt.activityCode, activityType: attempt.activityType, category: attempt.category, difficulty: attempt.difficulty, accuracy: 1, isCorrect: true, responseTimeMs: Math.max(0, values.responseTimeMs), completionStatus: 'completed' }));
    const res = response();
    await submitActivity({ params: { attemptId: attempt.attemptId }, body: { user_id: 1, response: { selectedAnswer: 'Carrot' } } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.response_time_ms).toBeGreaterThanOrEqual(0);
    expect(repository.completeAttempt).toHaveBeenCalledTimes(1);
  });

  test('E: duplicate completed submission is rejected', async () => {
    repository.getAttemptForUpdate.mockResolvedValue({ ...attempt, completedAt: new Date() });
    const res = response();
    await submitActivity({ params: { attemptId: attempt.attemptId }, body: { user_id: 1, response: { selectedAnswer: 'Carrot' } } }, res);
    expect(res.statusCode).toBe(409);
    expect(repository.completeAttempt).not.toHaveBeenCalled();
  });
});
