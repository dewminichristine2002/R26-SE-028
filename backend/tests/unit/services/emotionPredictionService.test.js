const { normalizePrediction, requestEmotionPrediction, EmotionPredictionError } = require('../../../src/services/emotionPredictionService');

const valid = { success: true, emotion: 'happiness', confidence: 0.6, source: 'ml_model', model_version: 'minilm_logistic_regression_v4', supported_classes: [] };

describe('emotion prediction response normalization', () => {
  test('normalizes a valid response', () => expect(normalizePrediction(valid)).toMatchObject({ emotion: 'happiness', confidence: 0.6, detectionSource: 'ml_model', modelVersion: 'minilm_logistic_regression_v4' }));
  test('preserves optional clarification metadata without changing model output', () => {
    expect(normalizePrediction({ ...valid, clarification_suggested: true,
      uncertainty: { needs_clarification: true, reasons: ['very_short_answer'] } }))
      .toMatchObject({ emotion: 'happiness', clarificationSuggested: true,
        uncertainty: { needs_clarification: true, reasons: ['very_short_answer'] } });
  });
  test.each([
    [{ ...valid, emotion: 'surprise' }, 'unsupported_class'],
    [{ ...valid, confidence: 2 }, 'invalid_confidence'],
    [{ ...valid, source: 'rule_fallback' }, 'invalid_source'],
    [{ ...valid, model_version: null }, 'missing_model_version'],
    [{ ...valid, model_version: 'unknown-model-v9' }, 'unknown_model_version'],
    [null, 'malformed_response'],
  ])('rejects invalid response %#', (payload, reason) => {
    expect(() => normalizePrediction(payload)).toThrow(EmotionPredictionError);
    try { normalizePrediction(payload); } catch (error) { expect(error.reason).toBe(reason); }
  });

  test.each([
    [{ code: 'ECONNABORTED', message: 'timed out' }, 'ml_timeout'],
    [{ code: 'ECONNREFUSED', message: 'offline' }, 'ml_unavailable'],
  ])('normalizes transport failures', async (failure, reason) => {
    const client = { post: jest.fn().mockRejectedValue(failure) };
    await expect(requestEmotionPrediction('demo', { client, timeout: 5 })).rejects.toMatchObject({ reason });
  });
});
