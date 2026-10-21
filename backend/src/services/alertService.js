const NEGATIVE_EMOTIONS = new Set(['sad', 'lonely', 'anxious', 'confused', 'angry', 'stressed']);

const EMOTION_LABELS = {
  angry: 'anger',
  anxious: 'anxiety',
  confused: 'confusion',
  lonely: 'loneliness',
  sad: 'sadness',
  stressed: 'stress',
};

const normalizeEmotion = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'anger') return 'angry';
  if (normalized === 'anxiety') return 'anxious';
  if (normalized === 'sadness') return 'sad';
  if (normalized === 'loneliness') return 'lonely';
  if (normalized === 'cognitive_fog') return 'confused';
  return normalized;
};

const alertTypeForEmotion = (emotion, riskLevel) => {
  if (emotion === 'lonely') {
    return 'loneliness_pattern';
  }
  if (riskLevel === 'high' && ['anxious', 'angry', 'stressed'].includes(emotion)) {
    return 'high_stress';
  }
  return 'negative_mood_trend';
};

const buildPrivacySafeMessage = ({ emotion, riskLevel, negativeMoodCount7d }) => {
  const emotionLabel = EMOTION_LABELS[emotion] || 'negative emotion';
  const repeatedText = Number(negativeMoodCount7d || 0) >= 2
    ? ' Similar concerns have appeared more than once recently.'
    : '';
  const urgencyText = riskLevel === 'high'
    ? ' A timely caregiver check-in may be helpful.'
    : ' A gentle follow-up may be helpful.';

  return `Recent emotional support check-ins suggest signs of ${emotionLabel}.${repeatedText}${urgencyText}`;
};

function evaluateAlertNeed({ elderId, caregiverId, detectedEmotion, riskLevel, negativeMoodCount7d = 0 }) {
  const emotion = normalizeEmotion(detectedEmotion);
  const isNegativeEmotion = NEGATIVE_EMOTIONS.has(emotion);

  if (!isNegativeEmotion && riskLevel !== 'high') {
    return null;
  }

  const isRepeatedConcern = Number(negativeMoodCount7d || 0) >= 2;
  const emotionLabel = EMOTION_LABELS[emotion] || 'emotional concern';
  const severity = riskLevel === 'high' ? 'high' : 'medium';
  const alertType = alertTypeForEmotion(emotion, riskLevel);

  return {
    elderId,
    caregiverId,
    alertType,
    severity,
    title: isRepeatedConcern
      ? 'Repeated emotional concern detected'
      : 'Emotional support concern detected',
    message: buildPrivacySafeMessage({
      emotion,
      riskLevel,
      negativeMoodCount7d,
    }),
    concernSummary: {
      detectedEmotion: emotion,
      emotionLabel,
      isRepeatedConcern,
    },
  };
}

module.exports = {
  evaluateAlertNeed,
  normalizeEmotion,
};
