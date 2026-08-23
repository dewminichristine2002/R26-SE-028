const { resolveRiskLevel } = require('../reminiscenceAlertService');

describe('existing repeated-concern caregiver threshold', () => {
  test.each([[0, 'medium'], [1, 'medium'], [2, 'high']])('%i prior matching concerns resolves to %s', (recentSameConcernCount, expected) => {
    expect(resolveRiskLevel({ detectedEmotionalState: 'loneliness', baseRiskLevel: 'medium', recentSameConcernCount })).toBe(expected);
  });
  test('cognitive performance is not an alert input', () => {
    expect(resolveRiskLevel({ detectedEmotionalState: 'happiness', baseRiskLevel: 'low', recentSameConcernCount: 99, accuracy: 0 })).toBe('low');
  });
});
