const { recommendActivity } = require('../../../src/services/activityRecommendationService');

const activities = [
  ['word_category_easy', 'cognitive_engagement', 'word_association', 'easy', 2],
  ['pattern_matching_medium', 'cognitive_engagement', 'pattern_matching', 'medium', 3],
  ['short_memory_recall_easy', 'cognitive_engagement', 'memory_recall', 'easy', 2],
  ['orientation_activity_easy', 'cognitive_engagement', 'orientation_activity', 'easy', 2],
  ['positive_reminiscence_easy', 'reminiscence_engagement', 'happy_event_recall', 'easy', 3],
  ['guided_breathing_easy', 'calming_support', 'guided_breathing', 'easy', 2],
  ['gentle_pause_easy', 'calming_support', 'gentle_pause', 'easy', 1],
].map(([activityCode, category, activityType, difficulty, estimatedDurationMinutes]) => ({
  activityCode, category, activityType, difficulty, estimatedDurationMinutes,
  title: activityCode, description: 'Safe predefined activity', instructions: 'Follow the short predefined steps.',
}));

function context(finalEmotionalState, overrides = {}) {
  return { finalEmotionalState, finalConfidence: 0.6, riskLevel: 'low', conversationEngagement: 'engaged', recentActivityHistory: [], activities, ...overrides };
}

describe('dynamic activity recommendation', () => {
  test('A: happiness routes to cognitive engagement', () => expect(recommendActivity(context('happiness')).recommendation).toMatchObject({ category: 'cognitive_engagement', difficulty: 'medium' }));
  test('B: neutral routes to light cognitive engagement', () => expect(recommendActivity(context('neutral')).recommendation).toMatchObject({ category: 'cognitive_engagement', difficulty: 'easy' }));
  test('C: loneliness routes to supportive reminiscence', () => expect(recommendActivity(context('loneliness')).recommendation.category).toBe('reminiscence_engagement'));
  test('D: sadness routes to gentle reminiscence', () => expect(recommendActivity(context('sadness')).recommendation).toMatchObject({ category: 'reminiscence_engagement', difficulty: 'easy' }));
  test('E: anxiety routes to easy calming support', () => expect(recommendActivity(context('anxiety', { riskLevel: 'medium' })).recommendation).toMatchObject({ category: 'calming_support', difficulty: 'easy' }));
  test('F: anger routes to calming support', () => expect(recommendActivity(context('anger')).recommendation.category).toBe('calming_support'));
  test('G: cognitive fog gets easy structured cognitive engagement', () => expect(recommendActivity(context('cognitive_fog')).recommendation).toMatchObject({ category: 'cognitive_engagement', difficulty: 'easy' }));
  test('H: limited engagement gets a short easy activity', () => {
    const result = recommendActivity(context('neutral', { conversationEngagement: 'limited_engagement' })).recommendation;
    expect(result.difficulty).toBe('easy');
    expect(result.estimated_duration_minutes).toBeLessThanOrEqual(2);
  });
  test('I: recent repetition penalty selects another equal candidate', () => {
    const first = recommendActivity(context('neutral')).recommendation.activity_code;
    const next = recommendActivity(context('neutral', { recentActivityHistory: [first] })).recommendation.activity_code;
    expect(next).not.toBe(first);
  });
  test('J: recommendation is deterministic', () => {
    const input = context('anxiety', { conversationEngagement: 'partially_engaged' });
    expect(recommendActivity(input)).toEqual(recommendActivity(input));
  });
  test('high risk never receives medium cognitive activity', () => expect(recommendActivity(context('happiness', { riskLevel: 'high' })).recommendation.difficulty).toBe('easy'));
  test('a persisted Medium recommendation is used when the new context remains safe', () => expect(recommendActivity(context('neutral', { recommendedDifficulty: 'medium' })).recommendation.difficulty).toBe('medium'));
  test('cognitive fog overrides a persisted Medium recommendation', () => expect(recommendActivity(context('cognitive_fog', { recommendedDifficulty: 'medium' })).recommendation.difficulty).toBe('easy'));
});
