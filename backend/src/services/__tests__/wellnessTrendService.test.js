const { buildWellnessTrends } = require('../wellnessTrendService');

const now = new Date('2026-08-22T12:00:00Z');
const date = (daysAgo, hour = 10) => new Date(Date.UTC(2026, 7, 22 - daysAgo, hour)).toISOString();
const session = (emotion, daysAgo = 1, overrides = {}) => ({ finalEmotionalState: emotion, riskLevel: ['happiness', 'neutral'].includes(emotion) ? 'low' : 'medium', completedAt: date(daysAgo), isComplete: true, ...overrides });
const activity = (category, daysAgo = 1, overrides = {}) => ({ activityCode: `${category}-${daysAgo}`, category, activityType: category === 'cognitive_engagement' ? 'word_association' : 'support', difficulty: 'easy', accuracy: category === 'cognitive_engagement' ? 1 : null, responseTimeMs: 1000, completionStatus: 'completed', completedAt: date(daysAgo), ...overrides });
const build = (overrides = {}) => buildWellnessTrends({ userId: 1, period: '7d', sessions: [], activities: [], alerts: [], now, ...overrides });

describe('wellness trend calculations', () => {
  test('A: empty history preserves null performance semantics', () => {
    const result = build();
    expect(result.emotional).toMatchObject({ total_checkins: 0, most_frequent_emotion: null });
    expect(result.cognitive_engagement.average_activity_accuracy).toBeNull();
  });
  test('B: emotion distribution uses official categories and completed total', () => {
    const result = build({ sessions: [session('happiness', 1), session('happiness', 2), session('neutral', 3), session('sadness', 4)] });
    expect(result.emotional.distribution.filter((row) => row.count)).toEqual([
      { emotion: 'happiness', count: 2, percentage: 50 }, { emotion: 'sadness', count: 1, percentage: 25 }, { emotion: 'neutral', count: 1, percentage: 25 },
    ]);
  });
  test('C: incomplete sessions are excluded', () => expect(build({ sessions: [session('sadness', 1, { isComplete: false })] }).emotional.total_checkins).toBe(0));
  test('D: only cognitive accuracy contributes to average', () => {
    const activities = [activity('cognitive_engagement', 1), activity('cognitive_engagement', 2, { accuracy: 0.5 }), activity('reminiscence_engagement', 3), activity('calming_support', 4)];
    expect(build({ activities }).cognitive_engagement.average_activity_accuracy).toBe(0.75);
  });
  test('E: response time averages valid completed cognitive attempts', () => {
    const result = build({ activities: [activity('cognitive_engagement', 1, { responseTimeMs: 1000 }), activity('cognitive_engagement', 2, { responseTimeMs: 3000 }), activity('calming_support', 3, { responseTimeMs: 9000 })] });
    expect(result.cognitive_engagement.average_response_time_ms).toBe(2000);
  });
  test('F: activity category counts remain separate', () => expect(build({ activities: [activity('cognitive_engagement'), activity('reminiscence_engagement'), activity('calming_support')] }).activities).toMatchObject({ total_completed: 3, cognitive_completed: 1, reminiscence_completed: 1, calming_completed: 1 }));
  test('G: 7-day period excludes older records', () => expect(build({ sessions: [session('happiness', 6), session('sadness', 8)] }).emotional.total_checkins).toBe(1));
  test('H: 30-day period includes appropriate older records', () => expect(build({ period: '30d', sessions: [session('happiness', 6), session('sadness', 20), session('neutral', 31)] }).emotional.total_checkins).toBe(2));
  test('I: emotion-count tie chooses the most recent tied category', () => expect(build({ sessions: [session('sadness', 1), session('happiness', 2)] }).emotional.most_frequent_emotion).toBe('sadness'));
  test('daily timeline uses latest session per UTC calendar date while counts include all', () => {
    const result = build({ sessions: [session('happiness', 1, { completedAt: date(1, 11) }), session('sadness', 1, { completedAt: date(1, 9) })] });
    expect(result.emotional.total_checkins).toBe(2);
    expect(result.emotional.timeline).toHaveLength(1);
    expect(result.emotional.timeline[0].emotion).toBe('happiness');
  });
  test('J: response contains no arbitrary combined wellness score', () => {
    const result = build({ sessions: [session('happiness')], activities: [activity('cognitive_engagement')] });
    expect(result.wellness_score).toBeUndefined();
    expect(result.brain_score).toBeUndefined();
    expect(result.performance_index).toBeUndefined();
  });
});
