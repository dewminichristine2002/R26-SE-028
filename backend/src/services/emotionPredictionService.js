const axios = require('axios');
const modelMetadata = require('../../ml/emotion_classifier/selected_model_metadata.json');
const { ensureEmotionMlServiceAvailable } = require('./emotionMlServiceManager');

const DEFAULT_ML_SERVICE_URL = 'http://localhost:8001';
const PROJECT_EMOTIONS = new Set(modelMetadata.supported_classes);
const ML_CONFIDENCE_THRESHOLD = Number(modelMetadata.confidence_threshold);
const SUPPORTED_MODEL_VERSIONS = new Set([
  'tfidf_linear_svm_calibrated_v3',
  'minilm_logistic_regression_v4',
  'minilm_logistic_regression_v5_answer_only',
]);

class EmotionPredictionError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

function normalizePrediction(data) {
  if (!data || data.success === false) {
    throw new EmotionPredictionError('malformed_response', 'ML response did not contain a successful prediction.');
  }
  if (data.source !== 'ml_model') {
    throw new EmotionPredictionError('invalid_source', 'ML response source was not ml_model.');
  }
  if (!PROJECT_EMOTIONS.has(data.emotion)) {
    throw new EmotionPredictionError('unsupported_class', `Unsupported ML emotion: ${data.emotion}`);
  }
  const confidence = Number(data.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new EmotionPredictionError('invalid_confidence', 'ML confidence must be between zero and one.');
  }
  if (!data.model_version || typeof data.model_version !== 'string') {
    throw new EmotionPredictionError('missing_model_version', 'ML response did not include a model version.');
  }
  if (!SUPPORTED_MODEL_VERSIONS.has(data.model_version)) {
    throw new EmotionPredictionError('unknown_model_version', 'ML response reported an unregistered model version.');
  }
  return {
    emotion: data.emotion,
    confidence,
    detectionSource: 'ml_model',
    modelVersion: data.model_version,
    supportedClasses: Array.isArray(data.supported_classes) ? data.supported_classes : [],
    clarificationSuggested: Boolean(data.clarification_suggested || data.uncertainty?.needs_clarification),
    uncertainty: data.uncertainty && typeof data.uncertainty === 'object' ? data.uncertainty : null,
  };
}

async function requestEmotionPrediction(text, { client = axios, timeout = 2500 } = {}) {
  const baseUrl = process.env.EMOTION_ML_SERVICE_URL || DEFAULT_ML_SERVICE_URL;
  try {
    if (client === axios) await ensureEmotionMlServiceAvailable();
    const response = await client.post(`${baseUrl}/predict-emotion`, { text }, { timeout });
    return normalizePrediction(response.data);
  } catch (error) {
    if (error instanceof EmotionPredictionError) throw error;
    const reason = error.code === 'ECONNABORTED' ? 'ml_timeout' : 'ml_unavailable';
    throw new EmotionPredictionError(reason, error.message || 'Emotion ML service request failed.');
  }
}

module.exports = {
  EmotionPredictionError,
  ML_CONFIDENCE_THRESHOLD,
  PROJECT_EMOTIONS,
  SUPPORTED_MODEL_VERSIONS,
  normalizePrediction,
  requestEmotionPrediction,
};
