const {
  ML_CONFIDENCE_THRESHOLD,
  requestEmotionPrediction,
} = require('./emotionPredictionService');

const emotionKeywords = {
  loneliness: ['alone', 'lonely', 'isolated', 'nobody', 'quiet', 'empty', 'miss', 'no one', 'by myself'],
  anxiety: ['worried', 'scared', 'afraid', 'nervous', 'panicked', 'stress', 'bills', 'fear', 'cannot relax'],
  sadness: ['sad', 'unhappy', 'cry', 'hurt', 'gone', 'tired', 'lost', 'down'],
  happiness: ['happy', 'happier', 'cheerful', 'good', 'wonderful', 'great', 'lovely', 'loved', 'smile', 'enjoyed'],
  anger: ['angry', 'upset', 'annoyed', 'irritated', 'frustrated'],
  cognitive_fog: ['confused', 'foggy', 'concentrating', 'concentrate', 'forgot', 'forget', 'unclear', 'cannot remember', "don't remember"],
};

const concernStates = new Set(['loneliness', 'anxiety', 'sadness', 'anger', 'cognitive_fog']);

function normalizeNarrative(text = '') {
  return String(text).toLowerCase().trim().replace(/\s+/g, ' ');
}

function countKeywordMatches(normalizedText, keywords) {
  return keywords.reduce((total, keyword) => {
    const escaped = normalizeNarrative(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = normalizedText.match(new RegExp(`(^|\\W)${escaped}(?=\\W|$)`, 'g'));
    return total + (matches ? matches.length : 0);
  }, 0);
}

function scoreNarrative(text) {
  const normalized = normalizeNarrative(text);
  return Object.fromEntries(
    Object.entries(emotionKeywords).map(([emotion, keywords]) => [emotion, countKeywordMatches(normalized, keywords)])
  );
}

function selectDetectedEmotion(scores) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const topScore = ranked[0]?.[1] || 0;
  if (!topScore || ranked.filter(([, score]) => score === topScore).length > 1) return 'neutral';
  return ranked[0][0];
}

function getBaseRiskLevel(emotion) {
  return concernStates.has(emotion) ? 'medium' : 'low';
}

function buildRuleFallbackAnalysis(transcribedNarrative, fallbackReason = 'rule_fallback_requested') {
  const normalizedText = normalizeNarrative(transcribedNarrative);
  const scores = scoreNarrative(normalizedText);
  const detectedEmotionalState = selectDetectedEmotion(scores);
  const totalMatches = Object.values(scores).reduce((total, score) => total + score, 0);
  const ruleScore = detectedEmotionalState === 'neutral' || totalMatches === 0
    ? null
    : Number((scores[detectedEmotionalState] / totalMatches).toFixed(3));
  return {
    emotion: detectedEmotionalState,
    confidence: null,
    detectedEmotionalState,
    confidenceScore: null,
    ruleScore,
    normalizedText,
    scores,
    baseRiskLevel: getBaseRiskLevel(detectedEmotionalState),
    detectionSource: 'rule_fallback',
    modelVersion: null,
    uncertainty: detectedEmotionalState === 'neutral',
    fallbackReason,
  };
}

async function analyzeNarrative(transcribedNarrative, options = {}) {
  try {
    const prediction = await requestEmotionPrediction(transcribedNarrative, options);
    if (prediction.confidence >= ML_CONFIDENCE_THRESHOLD) {
      return {
        emotion: prediction.emotion,
        confidence: prediction.confidence,
        detectedEmotionalState: prediction.emotion,
        confidenceScore: Number(prediction.confidence.toFixed(4)),
        ruleScore: null,
        scores: null,
        baseRiskLevel: getBaseRiskLevel(prediction.emotion),
        detectionSource: prediction.detectionSource,
        modelVersion: prediction.modelVersion,
        uncertainty: false,
        fallbackReason: null,
      };
    }
    return {
      ...buildRuleFallbackAnalysis(transcribedNarrative, 'ml_below_threshold'),
      rawMlEmotion: prediction.emotion,
      rawMlConfidence: prediction.confidence,
      rawMlModelVersion: prediction.modelVersion,
    };
  } catch (error) {
    return buildRuleFallbackAnalysis(transcribedNarrative, error.reason || 'ml_unavailable');
  }
}

module.exports = {
  ML_CONFIDENCE_THRESHOLD,
  analyzeNarrative,
  buildRuleFallbackAnalysis,
  concernStates,
  emotionKeywords,
  getBaseRiskLevel,
  normalizeNarrative,
  scoreNarrative,
  selectDetectedEmotion,
};
