jest.mock('../../../src/db/postgres', () => ({ query: jest.fn(), withTransaction: jest.fn() }));

const repository = require('../../../src/repositories/activityExecutionRepository');

describe('cognitive attempt duration persistence', () => {
  test('persists the measured duration supplied by the activity controller', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{
        attemptId: 'attempt-1', activityCode: 'word_completion_medium', category: 'cognitive_engagement',
        responseTimeMs: 3500, completionStatus: 'completed',
      }] }),
    };

    await repository.completeAttempt(client, {
      attemptId: 'attempt-1', response: {}, isCorrect: true, accuracy: 1,
      responseTimeMs: 3500, nextDifficulty: 'medium', explanation: {},
    });

    const [sql, parameters] = client.query.mock.calls[0];
    expect(sql).toContain('response_time_ms = GREATEST(0, $7::INTEGER)');
    expect(sql).not.toContain('NOW() - started_at');
    expect(parameters[6]).toBe(3500);
  });
});
