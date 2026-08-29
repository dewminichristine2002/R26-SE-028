jest.mock('../emotionPredictionService', () => ({
  ML_CONFIDENCE_THRESHOLD: 0.35,
  requestEmotionPrediction: jest.fn(),
}));

const predictionService = require('../emotionPredictionService');
const { analyzeNarrative, buildRuleFallbackAnalysis } = require('../narrativeAnalysisService');

const version = 'tfidf_linear_svm_calibrated_v2';

describe('canonical narrative analysis', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(['happiness', 'sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog', 'neutral'])(
    'accepts valid ML %s', async (emotion) => {
      predictionService.requestEmotionPrediction.mockResolvedValue({ emotion, confidence: 0.72, detectionSource: 'ml_model', modelVersion: version });
      const result = await analyzeNarrative('Synthetic demonstration text');
      expect(result).toMatchObject({ emotion, confidence: 0.72, detectionSource: 'ml_model', modelVersion: version, ruleScore: null });
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  );

  test('low confidence uses rule fallback without fake probability metadata', async () => {
    predictionService.requestEmotionPrediction.mockResolvedValue({ emotion: 'neutral', confidence: 0.2, detectionSource: 'ml_model', modelVersion: version });
    await expect(analyzeNarrative('I feel happy today')).resolves.toMatchObject({ emotion: 'happiness', confidence: null, detectionSource: 'rule_fallback', modelVersion: null, fallbackReason: 'ml_below_threshold' });
  });

  test('unavailable ML uses fallback', async () => {
    predictionService.requestEmotionPrediction.mockRejectedValue(Object.assign(new Error('offline'), { reason: 'ml_unavailable' }));
    await expect(analyzeNarrative('I feel sad')).resolves.toMatchObject({ emotion: 'sadness', confidence: null, modelVersion: null });
  });

  test('tied rule evidence resolves to neutral', () => {
    expect(buildRuleFallbackAnalysis('I feel happy and sad')).toMatchObject({ emotion: 'neutral', confidence: null, ruleScore: null, uncertainty: true });
  });

  test('happier variation remains an ML result when valid', async () => {
    predictionService.requestEmotionPrediction.mockResolvedValue({ emotion: 'happiness', confidence: 0.41, detectionSource: 'ml_model', modelVersion: version });
    await expect(analyzeNarrative('My daughter called and I felt much happier after talking with her.')).resolves.toMatchObject({ emotion: 'happiness', detectionSource: 'ml_model' });
  });
});
