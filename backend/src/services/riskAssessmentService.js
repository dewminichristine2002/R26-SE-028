const adaptiveRiskRepository = require('../repositories/adaptiveRiskRepository');

const BASE_RISK = Object.freeze({
  happiness: 'low',
  neutral: 'low',
  sadness: 'medium',
  loneliness: 'medium',
  anxiety: 'medium',
  anger: 'medium',
  cognitive_fog: 'medium',
});
const CONCERN_STATES = new Set(['sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog']);
const ALERT_TYPE = 'repeated_emotional_concern';
const WINDOW_DAYS = 7;

function getBaseRisk(finalEmotionalState) {
  const risk = BASE_RISK[finalEmotionalState];
  if (!risk) throw new Error(`Unsupported final emotional state: ${finalEmotionalState}`);
  return risk;
}

function buildSafeAlertMessage(emotionalState) {
  return `Repeated ${emotionalState.replace('_', ' ')}-related check-in results were recorded during the last 7 days. Consider checking in with the user.`;
}

function buildRiskResult({ finalEmotionalState, matchingConcernCount7d = 0, recentMatchingAlert = null }) {
  const baseRisk = getBaseRisk(finalEmotionalState);
  const repeatedConcern = CONCERN_STATES.has(finalEmotionalState) && matchingConcernCount7d >= 3;
  return {
    baseRisk,
    finalRisk: repeatedConcern ? 'high' : baseRisk,
    emotionalState: finalEmotionalState,
    matchingConcernCount7d,
    repeatedConcern,
    caregiverNotificationRequired: repeatedConcern,
    alertRequired: repeatedConcern,
    alertCreated: false,
    alertSuppressedReason: repeatedConcern && recentMatchingAlert ? 'recent_matching_alert_exists' : null,
    shouldCreateAlert: repeatedConcern && !recentMatchingAlert,
    recentMatchingAlert,
    alertType: ALERT_TYPE,
    alertMessage: repeatedConcern ? buildSafeAlertMessage(finalEmotionalState) : null,
    explanation: {
      rule: 'same_concern_3_within_7_days',
      state: finalEmotionalState,
      count: matchingConcernCount7d,
      windowDays: WINDOW_DAYS,
      currentSessionIncluded: true,
      alertCreated: false,
    },
  };
}

async function assessAdaptiveRisk({
  userId, finalEmotionalState, completedAt, client, repository = adaptiveRiskRepository,
}) {
  getBaseRisk(finalEmotionalState);
  if (!CONCERN_STATES.has(finalEmotionalState)) {
    return buildRiskResult({ finalEmotionalState });
  }
  if (!client) throw new Error('A transaction client is required for adaptive risk assessment.');
  await repository.lockConcernEpisode(client, userId, finalEmotionalState);
  const matchingConcernCount7d = await repository.countMatchingCompletedSessions({
    userId, emotionalState: finalEmotionalState, completedAt, days: WINDOW_DAYS,
  }, client);
  const recentMatchingAlert = matchingConcernCount7d >= 3
    ? await repository.findRecentMatchingAlert({ userId, emotionalState: finalEmotionalState, completedAt, days: WINDOW_DAYS }, client)
    : null;
  return buildRiskResult({ finalEmotionalState, matchingConcernCount7d, recentMatchingAlert });
}

module.exports = {
  ALERT_TYPE, BASE_RISK, CONCERN_STATES, WINDOW_DAYS,
  assessAdaptiveRisk, buildRiskResult, buildSafeAlertMessage, getBaseRisk,
};
