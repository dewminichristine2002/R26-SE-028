const { findActiveAttempt } = require('../../repositories/activityExecutionRepository');

describe('activity attempt ownership', () => {
  test('active-attempt reuse is scoped to user, session, and activity', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await findActiveAttempt({ userId: 9, sessionId: 'session-1', activityCode: 'word_category_easy' }, client);
    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain('WHERE user_id = $1 AND adaptive_session_id = $2');
    expect(values).toEqual([9, 'session-1', 'word_category_easy']);
  });
});
