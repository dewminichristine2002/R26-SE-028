function calculateRiskLevel({ detectedEmotion, lonelinessScore, stressScore, negativeMoodCount7d = 0 }) {
  if (
    stressScore >= 0.8 ||
    lonelinessScore >= 0.8 ||
    negativeMoodCount7d >= 4
  ) {
    return 'high';
  }

  if (
    detectedEmotion === 'sad' ||
    detectedEmotion === 'lonely' ||
    detectedEmotion === 'stressed' ||
    stressScore >= 0.45 ||
    lonelinessScore >= 0.45
  ) {
    return 'medium';
  }

  return 'low';
}

module.exports = {
  calculateRiskLevel,
};
