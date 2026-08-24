jest.mock('../../repositories/activityExecutionRepository', () => ({
  withTransaction: jest.fn(), getAttemptForUpdate: jest.fn(),
  getRecentCognitiveAttempts: jest.fn(), completeAttempt: jest.fn(),
  startActivityAttempt: jest.fn(), startSelfSelectedActivityAttempt: jest.fn(),
  listSelfSelectableActivities: jest.fn(), getSelfSelectedDifficulty: jest.fn(),
}));

const repository = require('../../repositories/activityExecutionRepository');
const { listCognitiveActivities, publicTask, startActivity, submitActivity } = require('../activityExecutionController');

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

describe('recommended and self-selected activity pathways', () => {
  beforeEach(() => jest.clearAllMocks());

  test('recommended starts still require and validate the adaptive session pathway', async () => {
    repository.startActivityAttempt.mockResolvedValue({ ...attempt, activitySource: 'recommended' });
    const res = response();
    await startActivity({ body: { user_id: 1, session_id: 'session-1', activity_code: 'word_category_easy' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.activity_source).toBe('recommended');
    expect(repository.startActivityAttempt).toHaveBeenCalledWith({ userId: 1, sessionId: 'session-1', activityCode: 'word_category_easy' });
    expect(repository.startSelfSelectedActivityAttempt).not.toHaveBeenCalled();
  });

  test('self-selected starts without an adaptive session and uses the same safe task contract', async () => {
    repository.startSelfSelectedActivityAttempt.mockResolvedValue({ ...attempt, activitySource: 'self_selected' });
    const res = response();
    await startActivity({ body: { user_id: 1, activity_code: 'word_category', activity_source: 'self_selected' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.activity_source).toBe('self_selected');
    expect(res.body.task).not.toHaveProperty('correctAnswer');
    expect(repository.startSelfSelectedActivityAttempt).toHaveBeenCalledWith({ userId: 1, activityCode: 'word_category' });
    expect(repository.startActivityAttempt).not.toHaveBeenCalled();
  });

  test('library exposes all eight existing activity types with server-selected difficulty', async () => {
    const codes = ['word_category', 'odd_one_out', 'word_completion', 'pattern_sequence', 'short_memory_recall', 'orientation_activity', 'simple_math', 'sequence_ordering'];
    repository.getSelfSelectedDifficulty.mockResolvedValue('medium');
    repository.listSelfSelectableActivities.mockResolvedValue(codes.map((activityCode) => ({ activityCode, title: activityCode, description: 'Short activity', instructions: 'Choose an answer', supportedDifficulties: ['easy', 'medium'], estimatedDurationMinutes: 2 })));
    const res = response();
    await listCognitiveActivities({ query: { user_id: '1' } }, res);
    expect(res.body.count).toBe(8);
    expect(res.body.activities.every((item) => item.recommended_difficulty === 'medium')).toBe(true);
  });
});

describe('task response safety', () => {
  test('recursively removes every scoring key before a task reaches the frontend', () => {
    const safe = publicTask({ taskSnapshot: { items: [{ id: 'one', correctAnswer: 'a' }, { id: 'two', correctAnswers: ['a'], correctOrder: ['a'] }] } });
    expect(JSON.stringify(safe)).not.toMatch(/correctAnswer|correctAnswers|correctOrder/);
  });
});
