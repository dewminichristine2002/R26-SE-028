const axios = require('axios');

const emotionKeywords = {
  loneliness: ['alone', 'lonely', 'isolated', 'nobody', 'quiet', 'empty', 'miss', 'no one', 'by myself'],
  anxiety: ['worried', 'scared', 'afraid', 'nervous', 'panicked', 'stress', 'bills', 'fear'],
  sadness: ['sad', 'unhappy', 'cry', 'hurt', 'gone', 'tired', 'lost'],
  happiness: ['happy', 'good', 'wonderful', 'great', 'loved', 'smile', 'enjoyed'],
  anger: ['angry', 'upset', 'annoyed', 'irritated', 'frustrated'],
  cognitive_fog: ['confused', 'forgot', 'forget', 'unclear', 'cannot remember', "don't remember"],
};

const concernStates = new Set(['loneliness', 'anxiety', 'sadness', 'anger', 'cognitive_fog']);
const DEFAULT_ML_SERVICE_URL = 'http://localhost:8001';
const ML_CONFIDENCE_THRESHOLD = 0.6;
const ML_MODEL_VERSION = 'tfidf_logistic_regression_v1';
const LONELINESS_FALLBACK_PHRASES = [
  'lonely',
  'alone',
  'miss my family',
  'miss my daughter',
  'miss my son',
  'house feels quiet',
  'no one visits',
  'feel left out',
  'isolated',
  'disconnected',
];

function normalizeNarrative(text = '') {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function clampConfidence(confidence) {
  const numericConfidence = Number(confidence);

  if (!Number.isFinite(numericConfidence)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numericConfidence));
}

function countKeywordMatches(normalizedText, keywords) {
  return keywords.reduce((total, keyword) => {
    const normalizedKeyword = normalizeNarrative(keyword);
    const escapedKeyword = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|\\W)${escapedKeyword}(?=\\W|$)`, 'g');
    const matches = normalizedText.match(pattern);

    return total + (matches ? matches.length : 0);
  }, 0);
}

function scoreNarrative(text) {
  const normalizedText = normalizeNarrative(text);

  return Object.entries(emotionKeywords).reduce((scores, [emotion, keywords]) => {
    scores[emotion] = countKeywordMatches(normalizedText, keywords);
    return scores;
  }, {});
}

function selectDetectedEmotion(scores) {
  const rankedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topEmotion, topScore] = rankedScores[0];
  const tiedTopScores = rankedScores.filter(([, score]) => score === topScore);

  if (topScore === 0 || tiedTopScores.length > 1) {
    return 'neutral';
  }

  return topEmotion;
}

function calculateConfidence(scores, detectedEmotion) {
  const totalMatches = Object.values(scores).reduce((total, score) => total + score, 0);

  if (detectedEmotion === 'neutral' || totalMatches === 0) {
    return 0;
  }

  const confidence = scores[detectedEmotion] / totalMatches;
  return Number(confidence.toFixed(2));
}

function getBaseRiskLevel(detectedEmotion) {
  if (detectedEmotion === 'happiness' || detectedEmotion === 'neutral') {
    return 'low';
  }

  if (concernStates.has(detectedEmotion)) {
    return 'medium';
  }

  return 'low';
}

function hasLonelinessFallbackPhrase(normalizedText) {
  return LONELINESS_FALLBACK_PHRASES.some((phrase) => normalizedText.includes(phrase));
}

function buildRuleFallbackAnalysis(transcribedNarrative) {
  const normalizedText = normalizeNarrative(transcribedNarrative);
  const scores = scoreNarrative(normalizedText);
  const detectedEmotionalState = selectDetectedEmotion(scores);
  const confidenceScore = calculateConfidence(scores, detectedEmotionalState);

  return {
    normalizedText,
    scores,
    detectedEmotionalState,
    confidenceScore,
    baseRiskLevel: getBaseRiskLevel(detectedEmotionalState),
    detectionSource: 'rule_fallback',
    modelVersion: null,
  };
}

async function requestMlPrediction(transcribedNarrative) {
  const baseUrl = process.env.EMOTION_ML_SERVICE_URL || DEFAULT_ML_SERVICE_URL;
  const response = await axios.post(
    `${baseUrl}/predict-emotion`,
    { text: transcribedNarrative },
    { timeout: 2000 }
  );

  return response.data;
}

async function analyzeNarrative(transcribedNarrative) {
  const fallbackAnalysis = buildRuleFallbackAnalysis(transcribedNarrative);

  if (hasLonelinessFallbackPhrase(fallbackAnalysis.normalizedText)) {
    return {
      ...fallbackAnalysis,
      detectedEmotionalState: 'loneliness',
      confidenceScore: Math.max(fallbackAnalysis.confidenceScore, 0.8),
      baseRiskLevel: getBaseRiskLevel('loneliness'),
    };
  }

  try {
    const mlResult = await requestMlPrediction(transcribedNarrative);
    const confidence = clampConfidence(mlResult?.confidence);

    if (mlResult?.success && mlResult.emotion && confidence >= ML_CONFIDENCE_THRESHOLD) {
      return {
        ...fallbackAnalysis,
        detectedEmotionalState: mlResult.emotion,
        confidenceScore: Number(confidence.toFixed(2)),
        baseRiskLevel: getBaseRiskLevel(mlResult.emotion),
        detectionSource: 'ml_model',
        modelVersion: mlResult.model_version || ML_MODEL_VERSION,
      };
    }
  } catch (error) {
    return fallbackAnalysis;
  }

  return fallbackAnalysis;
}

module.exports = {
  analyzeNarrative,
  buildRuleFallbackAnalysis,
  concernStates,
  emotionKeywords,
  hasLonelinessFallbackPhrase,
  normalizeNarrative,
};
