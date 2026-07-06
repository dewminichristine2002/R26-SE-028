const axios = require('axios');

const {
  inferEmotionFromEmoji,
  inferEmotionFromText,
  getExplicitEmotionSignal,
  normalizeEmotion,
  normalizeText,
} = require('../utils/emotionMapper');

const DEFAULT_ML_URL = 'http://127.0.0.1:8000';

function buildProbabilities(primaryEmotion) {
  const base = {
    happy: 0.06,
    neutral: 0.12,
    sad: 0.06,
    lonely: 0.06,
    anxious: 0.06,
    confused: 0.06,
    angry: 0.06,
  };

  base[normalizeEmotion(primaryEmotion)] = 0.7;
  return base;
}

function deriveScores(text, emotion) {
  const normalized = normalizeText(text);
  const normalizedEmotion = normalizeEmotion(emotion);
  const sentimentScore = normalizedEmotion === 'happy' ? 0.72 : normalizedEmotion === 'neutral' ? 0.1 : -0.58;
  const stressScore =
    normalizedEmotion === 'anxious' || normalizedEmotion === 'angry'
      ? 0.82
      : normalized.includes('worried') || normalized.includes('tired') || normalized.includes('confused')
        ? 0.63
        : 0.18;
  const lonelinessScore =
    normalizedEmotion === 'lonely' ? 0.84 : normalized.includes('alone') || normalized.includes('lonely') ? 0.71 : 0.14;

  return {
    sentimentScore,
    stressScore,
    lonelinessScore,
    confidence: normalizedEmotion === 'neutral' ? 0.58 : 0.84,
  };
}

function buildFallbackAnalysis({ emoji, text, transcript }) {
  const mergedText = [text, transcript].filter(Boolean).join(' ').trim();
  const textEmotion = inferEmotionFromText(mergedText);
  const emojiEmotion = emoji ? inferEmotionFromEmoji(emoji) : null;
  const detectedEmotion =
    emojiEmotion && emojiEmotion !== 'neutral' ? emojiEmotion : textEmotion;
  const scores = deriveScores(mergedText, detectedEmotion);

  return {
    detectedEmotion: normalizeEmotion(detectedEmotion),
    emotionProbabilities: buildProbabilities(detectedEmotion),
    ...scores,
  };
}

async function analyzeWithMlService({ text, transcript }) {
  const mergedText = [text, transcript].filter(Boolean).join(' ').trim();
  const baseUrl = process.env.EMOTIONAL_SUPPORT_ML_URL || DEFAULT_ML_URL;
  const response = await axios.post(
    `${baseUrl}/predict/text`,
    { text: mergedText || 'neutral' },
    { timeout: 5000 }
  );

  const data = response.data;
  const detectedEmotion = normalizeEmotion(data.emotion);
  const rawScores = data.scores || buildProbabilities(detectedEmotion);
  const emotionProbabilities = Object.entries(rawScores).reduce((scores, [emotion, score]) => {
    scores[normalizeEmotion(emotion)] = Math.max(scores[normalizeEmotion(emotion)] || 0, score);
    return scores;
  }, {});

  return {
    detectedEmotion,
    emotionProbabilities,
    sentimentScore: data.sentiment_score,
    stressScore: data.stress_score,
    lonelinessScore: data.loneliness_score,
    confidence: data.confidence,
  };
}

async function analyzeCheckIn(payload) {
  const fallbackAnalysis = buildFallbackAnalysis(payload);
  const mergedText = [payload.text, payload.transcript].filter(Boolean).join(' ').trim();
  const explicitEmotion = getExplicitEmotionSignal(mergedText);

  try {
    const mlAnalysis = await analyzeWithMlService(payload);

    if (explicitEmotion && normalizeEmotion(explicitEmotion) !== mlAnalysis.detectedEmotion) {
      return fallbackAnalysis;
    }

    if (
      fallbackAnalysis.detectedEmotion !== 'neutral' &&
      (mlAnalysis.detectedEmotion === 'neutral' || Number(mlAnalysis.confidence || 0) < 0.7)
    ) {
      return fallbackAnalysis;
    }

    return mlAnalysis;
  } catch (error) {
    return fallbackAnalysis;
  }
}

module.exports = {
  analyzeCheckIn,
};
