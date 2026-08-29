const { recommendNextDifficulty } = require('../cognitiveDifficultyService');

const success = { difficulty: 'easy', accuracy: 1, completionStatus: 'completed' };
function context(overrides = {}) {
  return { currentDifficulty: 'easy', accuracy: 1, responseTime: 1000, completionStatus: 'completed', finalEmotionalState: 'happiness', riskLevel: 'low', conversationEngagement: 'engaged', recentCognitiveAttempts: [], ...overrides };
}

describe('emotion-aware cognitive difficulty', () => {
  test('A: repeated easy high accuracy can increase to medium', () => expect(recommendNextDifficulty(context({ recentCognitiveAttempts: [success, success] })).nextDifficulty).toBe('medium'));
  test('B: one high score remains easy', () => expect(recommendNextDifficulty(context()).nextDifficulty).toBe('easy'));
  test('C: medium with low accuracy becomes easy', () => expect(recommendNextDifficulty(context({ currentDifficulty: 'medium', accuracy: 0.4 })).nextDifficulty).toBe('easy'));
  test('D: medium with moderate accuracy remains medium', () => expect(recommendNextDifficulty(context({ currentDifficulty: 'medium', accuracy: 0.6 })).nextDifficulty).toBe('medium'));
  test('E: anxiety protection overrides high accuracy', () => expect(recommendNextDifficulty(context({ finalEmotionalState: 'anxiety', recentCognitiveAttempts: [success, success] })).nextDifficulty).toBe('easy'));
  test('F: cognitive fog protection overrides high accuracy', () => expect(recommendNextDifficulty(context({ finalEmotionalState: 'cognitive_fog', recentCognitiveAttempts: [success, success] })).nextDifficulty).toBe('easy'));
  test('G: high risk overrides high accuracy', () => expect(recommendNextDifficulty(context({ riskLevel: 'high', recentCognitiveAttempts: [success, success] })).nextDifficulty).toBe('easy'));
  test('H: limited engagement remains easy', () => expect(recommendNextDifficulty(context({ conversationEngagement: 'limited_engagement', recentCognitiveAttempts: [success, success] })).nextDifficulty).toBe('easy'));
  test('I: same input is deterministic and response time is not used', () => {
    const input = context({ recentCognitiveAttempts: [success, success] });
    expect(recommendNextDifficulty(input)).toEqual(recommendNextDifficulty(input));
    expect(recommendNextDifficulty(input).explanation.responseTimeUsedForDecision).toBe(false);
  });
});
