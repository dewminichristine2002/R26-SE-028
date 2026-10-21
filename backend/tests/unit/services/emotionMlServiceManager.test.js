const axios = require('axios');
const metadata = require('../../../ml/emotion_classifier/selected_model_metadata.json');

jest.mock('axios', () => ({
  get: jest.fn(),
}));

const manager = require('../../../src/services/emotionMlServiceManager');

describe('emotion ML service readiness contract', () => {
  test('accepts only a ready emotion classifier with the expected production model', () => {
    expect(manager.expectedService({
      service: 'emotion_classifier', ready: true, model_status: 'ready', artifact_integrity: 'verified',
      model_version: 'minilm_logistic_regression_v4', supported_classes: metadata.supported_classes,
    })).toEqual({ ok: true });
  });

  test.each([
    [{ service: 'other', ready: true, model_status: 'ready', model_version: 'minilm_logistic_regression_v4', supported_classes: Array(7) }, 'identity_mismatch'],
    [{ service: 'emotion_classifier', ready: false, model_status: 'unavailable', model_version: null, supported_classes: [] }, 'not_ready'],
    [{ service: 'emotion_classifier', ready: true, model_status: 'ready', artifact_integrity: 'verified', model_version: 'tfidf_linear_svm_calibrated_v3', supported_classes: Array(7) }, 'model_mismatch'],
    [{ service: 'emotion_classifier', ready: true, model_status: 'ready', artifact_integrity: 'verified', model_version: 'minilm_logistic_regression_v4', supported_classes: [] }, 'class_mismatch'],
  ])('rejects unhealthy or mismatched service identities', (payload, reason) => {
    expect(manager.expectedService(payload)).toMatchObject({ ok: false, reason });
  });

  test('reports the payload served by the configured port without claiming it', async () => {
    axios.get.mockResolvedValueOnce({ status: 200, data: { service: 'generic_ml', ready: true } });
    await expect(manager.ensureEmotionMlServiceAvailable()).rejects.toThrow(/not the ElderMeds emotion classifier/);
    expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/\/health$/), expect.any(Object));
  });
});
