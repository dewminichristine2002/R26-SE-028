function evaluateAlertNeed({ elderId, caregiverId, detectedEmotion, riskLevel }) {
  if (riskLevel !== 'high') {
    return null;
  }

  return {
    elderId,
    caregiverId,
    alertType:
      detectedEmotion === 'lonely' ? 'loneliness_pattern' : 'high_stress',
    severity: 'high',
    title: 'High-risk emotional pattern detected',
    message: `Recent check-in indicates a ${detectedEmotion} state that needs caregiver review.`,
  };
}

module.exports = {
  evaluateAlertNeed,
};
