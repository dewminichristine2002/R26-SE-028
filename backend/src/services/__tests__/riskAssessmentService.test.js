const {
  BASE_RISK,
  assessAdaptiveRisk,
  buildRiskResult,
  buildSafeAlertMessage,
  getBaseRisk,
} = require('../riskAssessmentService');

const completedAt = new Date('2026-08-22T10:00:00Z');
const client = { query: jest.fn() };

function repositoryFor({ count, alert = null }) {
  return {
    lockConcernEpisode: jest.fn().mockResolvedValue(undefined),
    countMatchingCompletedSessions: jest.fn().mockResolvedValue(count),
    findRecentMatchingAlert: jest.fn().mockResolvedValue(alert),
  };
}

describe('canonical adaptive risk assessment', () => {
  test.each(Object.entries(BASE_RISK))('%s has exact base risk %s', (emotion, expected) => {
    expect(getBaseRisk(emotion)).toBe(expected);
  });

  test.each([[1, 'medium', false], [2, 'medium', false], [3, 'high', true]])(
    '%i same loneliness aggregate sessions produce %s and alert=%s',
    async (count, risk, required) => {
      const repository = repositoryFor({ count });
      const result = await assessAdaptiveRisk({ userId: 7, finalEmotionalState: 'loneliness', completedAt, client, repository });
      expect(result).toMatchObject({ finalRisk: risk, matchingConcernCount7d: count, caregiverNotificationRequired: required, shouldCreateAlert: required });
    }
  );

  test('different concern types cannot be combined into high risk', () => {
    expect(buildRiskResult({ finalEmotionalState: 'loneliness', matchingConcernCount7d: 1 })).toMatchObject({ finalRisk: 'medium', repeatedConcern: false });
  });

  test('fourth same concern is high but a recent matching alert suppresses duplication', async () => {
    const repository = repositoryFor({ count: 4, alert: { alertId: 'existing', status: 'unread' } });
    const result = await assessAdaptiveRisk({ userId: 7, finalEmotionalState: 'loneliness', completedAt, client, repository });
    expect(result).toMatchObject({ finalRisk: 'high', alertRequired: true, shouldCreateAlert: false, alertSuppressedReason: 'recent_matching_alert_exists' });
  });

  test('a new qualifying episode after the alert window may create a new alert', async () => {
    const repository = repositoryFor({ count: 3, alert: null });
    const result = await assessAdaptiveRisk({ userId: 7, finalEmotionalState: 'loneliness', completedAt, client, repository });
    expect(result.shouldCreateAlert).toBe(true);
  });

  test('confidence and cognitive performance fields cannot affect risk', async () => {
    const repository = repositoryFor({ count: 1 });
    const result = await assessAdaptiveRisk({
      userId: 7, finalEmotionalState: 'cognitive_fog', completedAt, client, repository,
      finalConfidence: 0.99, accuracyScore: 0, responseTimeMs: 999999, recommendedNextDifficulty: 'easy',
    });
    expect(result).toMatchObject({ baseRisk: 'medium', finalRisk: 'medium', caregiverNotificationRequired: false });
  });

  test('positive state never queries history or creates an alert', async () => {
    const repository = repositoryFor({ count: 99 });
    const result = await assessAdaptiveRisk({ userId: 7, finalEmotionalState: 'happiness', completedAt, client, repository });
    expect(result.finalRisk).toBe('low');
    expect(repository.countMatchingCompletedSessions).not.toHaveBeenCalled();
  });

  test('safe alert message is predefined and non-diagnostic', () => {
    const message = buildSafeAlertMessage('cognitive_fog');
    expect(message).toContain('Repeated cognitive fog-related check-in results');
    expect(message).not.toMatch(/diagnos|dement|disease|decline/i);
  });
});
