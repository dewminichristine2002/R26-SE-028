const axios = require('axios');
const { ensureMlServiceAvailable } = require('./mlServiceManager');
const { buildFdaSeriousFeaturePayload } = require('./mlFeatureBuilder');

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 60000);

const clampPercent = (value) => Math.max(0, Math.min(100, value));

const mapPredictionToRisk = (parsed) => {
  const seriousProb = Number(parsed.seriousProbability ?? parsed.probability ?? 0);
  const nonSeriousProb = 1 - seriousProb;
  const mlDangerScore = clampPercent(Math.round(seriousProb * 1000) / 10);
  const mlClassConfidence = clampPercent(Math.round(Math.max(seriousProb, nonSeriousProb) * 1000) / 10);

  return {
    mlRiskScore: mlDangerScore,
    mlRiskLevel: parsed.riskLevelLabel || (parsed.prediction === 1 ? 'Dangerous' : 'Safe'),
    mlDangerProbability: seriousProb,
    mlClassProbability: seriousProb,
    mlClassConfidenceScore: mlClassConfidence,
    adrRiskProbability: seriousProb,
    probability: seriousProb,
    probabilityDangerous: seriousProb,
    probabilitySafe: nonSeriousProb,
    threshold: parsed.threshold,
    classification: parsed.classification,
  };
};

const predictMedicineRisk = async ({ analysisPayload, profile, questionnaireAnswers }) => {
  const payload = buildFdaSeriousFeaturePayload({ analysisPayload, profile, questionnaireAnswers });

  try {
    await ensureMlServiceAvailable();
    const response = await axios.post(`${ML_SERVICE_URL}/predict/medicine-safety`, payload, {
      timeout: ML_TIMEOUT_MS,
    });
    const parsed = response.data || {};

    return {
      available: true,
      target: 'serious',
      prediction: parsed.prediction,
      binaryPrediction: parsed.prediction,
      classification: parsed.classification,
      threshold: parsed.threshold,
      seriousProbability: parsed.seriousProbability,
      adrRiskProbability: parsed.seriousProbability,
      probability: parsed.seriousProbability,
      probabilityDangerous: parsed.seriousProbability,
      probabilitySafe: parsed.seriousProbability != null ? 1 - Number(parsed.seriousProbability) : null,
      mlRiskScore: parsed.mlRiskScore,
      riskLevelLabel: parsed.riskLevelLabel,
      featurePayload: payload,
      featureRow: parsed.featureRow || payload,
      featuresUsed: parsed.featuresUsed || Object.keys(payload),
      modelPath: parsed.modelPath,
      ...mapPredictionToRisk(parsed),
    };
  } catch (error) {
    return {
      available: false,
      reason: error.response?.data?.detail || error.message || 'Failed to call medicine safety ML service.',
      featurePayload: payload,
    };
  }
};

module.exports = {
  predictMedicineRisk,
  buildFdaSeriousFeaturePayload,
};
