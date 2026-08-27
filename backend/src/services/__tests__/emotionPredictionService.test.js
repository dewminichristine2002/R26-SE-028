const { normalizePrediction, requestEmotionPrediction, EmotionPredictionError } = require('../emotionPredictionService');

const valid = { success: true, emotion: 'happiness', confidence: 0.6, source: 'ml_model', model_version: 'real-v2', supported_classes: [] };

describe('emotion prediction response normalization', () => {
  test('normalizes a valid response', () => expect(normalizePrediction(valid)).toMatchObject({ emotion: 'happiness', confidence: 0.6, detectionSource: 'ml_model', modelVersion: 'real-v2' }));
  test.each([
    [{ ...valid, emotion: 'surprise' }, 'unsupported_class'],
    [{ ...valid, confidence: 2 }, 'invalid_confidence'],
    [{ ...valid, source: 'rule_fallback' }, 'invalid_source'],
    [{ ...valid, model_version: null }, 'missing_model_version'],
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
