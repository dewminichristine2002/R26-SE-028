function evaluateAlertNeed({ elderId, caregiverId, detectedEmotion, riskLevel, negativeMoodCount7d = 0 }) {
  const isRepeatedLoneliness = detectedEmotion === 'lonely' && negativeMoodCount7d >= 2;
  const isRepeatedSadness = detectedEmotion === 'sad' && negativeMoodCount7d >= 2;

  if (riskLevel !== 'high' && !isRepeatedLoneliness && !isRepeatedSadness) {
    return null;
  }

  if (isRepeatedLoneliness) {
    return {
      elderId,
      caregiverId,
      alertType: 'loneliness_pattern',
      severity: riskLevel === 'high' ? 'high' : 'medium',
      title: 'Repeated loneliness check-ins',
      message: 'Recent emotional check-ins suggest the elder may be feeling lonely repeatedly.',
    };
  }

  if (isRepeatedSadness) {
    return {
      elderId,
      caregiverId,
      alertType: 'negative_mood_trend',
      severity: riskLevel === 'high' ? 'high' : 'medium',
      title: 'Repeated sad mood pattern',
      message: 'Recent emotional check-ins suggest the elder may need gentle follow-up.',
    };
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
