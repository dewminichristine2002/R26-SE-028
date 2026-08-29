const {
  countMatchingCompletedSessions,
  createAdaptiveCaregiverAlert,
} = require('../../repositories/adaptiveRiskRepository');

describe('adaptive risk persistence contract', () => {
  test('history query uses only completed aggregate sessions in the exact rolling window', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ count: 2 }] }) };
    const count = await countMatchingCompletedSessions({ userId: 5, emotionalState: 'anxiety', completedAt: new Date('2026-08-22T10:00:00Z') }, client);
    const sql = client.query.mock.calls[0][0];
    expect(count).toBe(2);
    expect(sql).toContain('FROM adaptive_chat_sessions');
    expect(sql).toContain('final_emotional_state = $2');
    expect(sql).toContain('is_complete = TRUE');
    expect(sql).toContain('completed_at IS NOT NULL');
    expect(sql).not.toMatch(/narrative_logs|adaptive_chat_turns|adaptive_activity_attempts/);
  });

  test('alert insertion is retry-safe for session plus type', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const result = await createAdaptiveCaregiverAlert(client, {
      userId: 5, adaptiveSessionId: '00000000-0000-4000-8000-000000000005',
      emotionalState: 'anxiety', matchingConcernCount7d: 3,
      message: 'Safe message', explanation: { rule: 'same_concern_3_within_7_days' },
    });
    const sql = client.query.mock.calls[0][0];
    expect(result).toBeNull();
    expect(sql).toContain('ON CONFLICT (adaptive_session_id, alert_type)');
    expect(sql).toContain('DO NOTHING');
  });
});
