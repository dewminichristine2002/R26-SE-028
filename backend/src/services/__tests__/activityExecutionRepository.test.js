const { buildTaskSnapshot, findActiveAttempt } = require('../../repositories/activityExecutionRepository');

describe('activity attempt ownership', () => {
  test('active-attempt reuse is scoped to user, session, and activity', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await findActiveAttempt({ userId: 9, sessionId: 'session-1', activityCode: 'word_category_easy' }, client);
    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain('WHERE user_id = $1 AND adaptive_session_id = $2');
    expect(values).toEqual([9, 'session-1', 'word_category_easy']);
  });
});

describe('curated task selection', () => {
  test('Easy has 3 items and Medium has 4 items', () => {
    expect(buildTaskSnapshot({ activityCode: 'word_category_easy', difficulty: 'easy', priorCount: 0 }).items).toHaveLength(3);
    expect(buildTaskSnapshot({ activityCode: 'word_category_medium', difficulty: 'medium', priorCount: 0 }).items).toHaveLength(4);
  });

  test('consecutive attempts rotate deterministically to different starting items', () => {
    const first = buildTaskSnapshot({ activityCode: 'simple_math_easy', difficulty: 'easy', priorCount: 0 });
    const second = buildTaskSnapshot({ activityCode: 'simple_math_easy', difficulty: 'easy', priorCount: 1 });
    expect(first.items[0].id).not.toBe(second.items[0].id);
    expect(buildTaskSnapshot({ activityCode: 'simple_math_easy', difficulty: 'easy', priorCount: 1 })).toEqual(second);
  });
});
