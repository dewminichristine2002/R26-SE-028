const { concernStates } = require('./narrativeAnalysisService');

function resolveRiskLevel({ detectedEmotionalState, baseRiskLevel, recentSameConcernCount }) {
  if (
    concernStates.has(detectedEmotionalState) &&
    Number(recentSameConcernCount || 0) >= 2
  ) {
    return 'high';
  }

  return baseRiskLevel;
}

function buildCaregiverAlertPayload({ detectedEmotionalState, recentSameConcernCount }) {
  return {
    alertType: 'repeated_reminiscence_concern',
    alertMessage: 'Repeated emotional or cognitive concern patterns were detected during reminiscence interactions.',
    triggerReason: `${detectedEmotionalState} appeared ${Number(recentSameConcernCount || 0) + 1} times within 7 days.`,
    severity: 'high',
  };
}

module.exports = {
  buildCaregiverAlertPayload,
  resolveRiskLevel,
};
