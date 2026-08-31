const { buildTaskSnapshot, findActiveAttempt, findActiveSelfSelectedAttempt, getAttemptForUpdate, listSelfSelectableActivities } = require('../../../src/repositories/activityExecutionRepository');

describe('activity attempt ownership', () => {
  test('active-attempt reuse is scoped to user, session, and activity', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await findActiveAttempt({ userId: 9, sessionId: 'session-1', activityCode: 'word_category_easy' }, client);
    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain('WHERE user_id = $1 AND adaptive_session_id = $2');
    expect(values).toEqual([9, 'session-1', 'word_category_easy']);
  });

  test('self-selected reuse is scoped to user and activity and does not require a session', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await findActiveSelfSelectedAttempt({ userId: 9, activityCode: 'odd_one_out_easy' }, client);
    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain("activity_source = 'self_selected'");
    expect(sql).not.toContain('adaptive_session_id = $');
    expect(values).toEqual([9, 'odd_one_out_easy']);
  });

  test('library is sourced from active cognitive support activities', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await listSelfSelectableActivities(client);
    const [sql] = client.query.mock.calls[0];
    expect(sql).toContain('FROM support_activities');
    expect(sql).toContain("category = 'cognitive_engagement'");
    expect(sql).toContain('is_active = TRUE');
  });

  test('submission locks only the attempt row when the adaptive session join is nullable', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await getAttemptForUpdate(client, 'attempt-1', 9);
    const [sql, values] = client.query.mock.calls[0];
    expect(sql).toContain('LEFT JOIN adaptive_chat_sessions');
    expect(sql).toContain('FOR UPDATE OF attempt');
    expect(values).toEqual(['attempt-1', 9]);
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
