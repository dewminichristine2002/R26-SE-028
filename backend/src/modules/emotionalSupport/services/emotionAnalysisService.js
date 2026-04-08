const axios = require('axios');

const {
  inferEmotionFromEmoji,
  inferEmotionFromText,
  normalizeText,
} = require('../utils/emotionMapper');

const DEFAULT_ML_URL = 'http://127.0.0.1:8000';

function buildProbabilities(primaryEmotion) {
  const base = {
    happy: 0.06,
    neutral: 0.12,
    sad: 0.06,
    lonely: 0.06,
    stressed: 0.06,
  };

  base[primaryEmotion] = 0.7;
  return base;
}

function deriveScores(text, emotion) {
  const normalized = normalizeText(text);
  const sentimentScore = emotion === 'happy' ? 0.72 : emotion === 'neutral' ? 0.1 : -0.58;
  const stressScore =
    emotion === 'stressed' ? 0.82 : normalized.includes('worried') || normalized.includes('tired') ? 0.63 : 0.18;
  const lonelinessScore =
    emotion === 'lonely' ? 0.84 : normalized.includes('alone') || normalized.includes('lonely') ? 0.71 : 0.14;

  return {
    sentimentScore,
    stressScore,
    lonelinessScore,
    confidence: emotion === 'neutral' ? 0.58 : 0.84,
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
    detectedEmotion,
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
  return {
    detectedEmotion: data.emotion,
    emotionProbabilities: data.scores || buildProbabilities(data.emotion),
    sentimentScore: data.sentiment_score,
    stressScore: data.stress_score,
    lonelinessScore: data.loneliness_score,
    confidence: data.confidence,
  };
}

async function analyzeCheckIn(payload) {
  try {
    return await analyzeWithMlService(payload);
  } catch (error) {
    return buildFallbackAnalysis(payload);
  }
}

module.exports = {
  analyzeCheckIn,
};
