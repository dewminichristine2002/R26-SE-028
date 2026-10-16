jest.mock('../../../src/repositories/activityExecutionRepository', () => ({
  withTransaction: jest.fn(), getAttemptForUpdate: jest.fn(),
  getRecentCognitiveAttempts: jest.fn(), completeAttempt: jest.fn(),
  startActivityAttempt: jest.fn(), startSelfSelectedActivityAttempt: jest.fn(),
  listSelfSelectableActivities: jest.fn(), getSelfSelectedDifficulty: jest.fn(),
}));

const repository = require('../../../src/repositories/activityExecutionRepository');
const { listCognitiveActivities, publicTask, startActivity, submitActivity } = require('../../../src/controllers/activityExecutionController');
const { BANK } = require('../../../src/data/cognitiveActivityBank');

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
    expect(repository.startSelfSelectedActivityAttempt).toHaveBeenCalledWith({ userId: 1, activityCode: 'word_category', requestedDifficulty: null });
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

describe('Word Completion answer API contract', () => {
  const item = BANK.word_completion.medium.find((question) => question.id === 'wd_m3');
  const wordAttempt = {
    attemptId: 'word-attempt', userId: 1, category: 'cognitive_engagement',
    activityCode: 'word_completion_medium', activityType: 'word_completion', difficulty: 'medium',
    completionStatus: 'started', completedAt: null, startedAt: new Date(Date.now() - 20),
    taskSnapshot: { activityType: 'word_completion', difficulty: 'medium', totalItems: 1, items: [item] },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.withTransaction.mockImplementation((callback) => callback({}));
    repository.getAttemptForUpdate.mockResolvedValue(wordAttempt);
    repository.getRecentCognitiveAttempts.mockResolvedValue([]);
    repository.completeAttempt.mockImplementation(async (_client, values) => ({
      ...values, attemptId: wordAttempt.attemptId, activityCode: wordAttempt.activityCode,
      activityType: wordAttempt.activityType, category: wordAttempt.category,
      difficulty: wordAttempt.difficulty, completionStatus: 'completed',
      response: values.response, accuracy: values.accuracy, isCorrect: values.isCorrect,
      responseTimeMs: values.responseTimeMs,
    }));
  });

  async function postAnswer(selectedAnswer) {
    const res = response();
    await submitActivity({ params: { attemptId: wordAttempt.attemptId }, body: { user_id: 1, response: { itemResponses: [{ itemId: item.id, selectedAnswer }] } } }, res);
    return res;
  }

  test.each(['O', 'o', '  o  '])('accepts correct typed letter %j via the submission endpoint', async (answer) => {
    const res = await postAnswer(answer);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, accuracy: 1, is_correct: true, correct_answers: 1 });
    expect(repository.completeAttempt.mock.calls[0][1].response.itemResponses[0].selectedAnswer).toBe('o');
  });

  test('accepts a wrong letter as a completed incorrect answer, not a request error', async () => {
    const res = await postAnswer('A');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, accuracy: 0, is_correct: false, correct_answers: 0 });
  });

  test('records summed per-question answer time instead of the idle time since the attempt started', async () => {
    const secondItem = BANK.word_completion.medium.find((question) => question.id !== item.id);
    const timedAttempt = {
      ...wordAttempt,
      startedAt: new Date(Date.now() - 5554600),
      taskSnapshot: { activityType: 'word_completion', difficulty: 'medium', totalItems: 2, items: [item, secondItem] },
    };
    repository.getAttemptForUpdate.mockResolvedValue(timedAttempt);
    const res = response();
    await submitActivity({
      params: { attemptId: timedAttempt.attemptId },
      body: { user_id: 1, response: { itemResponses: [
        { itemId: item.id, selectedAnswer: 'A', responseTimeMs: 1200 },
        { itemId: secondItem.id, selectedAnswer: 'A', responseTimeMs: 2300 },
      ] } },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(repository.completeAttempt.mock.calls[0][1].responseTimeMs).toBe(3500);
    expect(res.body.response_time_ms).toBe(3500);
  });

  test.each([['', 'Please enter the missing letter.'], ['   ', 'Please enter the missing letter.'], ['morning', 'Please enter one letter only.']])(
    'returns friendly validation for invalid answer %j', async (answer, message) => {
      const res = await postAnswer(answer);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe(message);
      expect(repository.completeAttempt).not.toHaveBeenCalled();
    },
  );

  test('preserves skip handling through the API', async () => {
    const res = response();
    await submitActivity({ params: { attemptId: wordAttempt.attemptId }, body: { user_id: 1, response: { itemResponses: [{ itemId: item.id, skipped: true }] } } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, skipped_items: 1 });
  });

  test('still rejects repeated completed submissions with conflict', async () => {
    repository.getAttemptForUpdate.mockResolvedValue({ ...wordAttempt, completedAt: new Date() });
    const res = await postAnswer('o');
    expect(res.statusCode).toBe(409);
  });

  test('recovers after a repository failure without persisting a partial score', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    repository.getAttemptForUpdate.mockRejectedValueOnce(new Error('temporary repository failure'));
    const failed = await postAnswer('o');
    expect(failed.statusCode).toBe(500);
    expect(repository.completeAttempt).not.toHaveBeenCalled();
    const recovered = await postAnswer('o');
    expect(recovered.statusCode).toBe(200);
    consoleError.mockRestore();
  });
});
