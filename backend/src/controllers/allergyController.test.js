jest.mock('../models/allergyModel', () => ({
  getProfile: jest.fn(),
  listQuestionnaireAnswers: jest.fn().mockResolvedValue([]),
  listHistoryMatchesForMedicine: jest.fn().mockResolvedValue([]),
  createCard: jest.fn().mockResolvedValue({ id: 1 }),
}));
jest.mock('../config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../services/mlPredictionService', () => ({
  predictMedicineRisk: jest.fn().mockResolvedValue({
    available: true, probability: 0, probabilityDangerous: 0,
    mlRiskLevel: 'Safe', mlRiskScore: 0,
  }),
}));
jest.mock('../services/medicineInputPipeline', () => ({
  buildPipelineReport: jest.fn().mockResolvedValue({}),
}));
// The checked-in fallback has no DDInter rows; supply a deterministic fixture.
jest.mock('../data/medicationKnowledge', () => ({
  RXNORM_DRUGS: [],
  DDINTER_INTERACTIONS: [{
    drugA: 'aspirin', drugB: 'warfarin', severity: 'high', description: 'Interaction test fixture',
  }],
}));

const allergyModel = require('../models/allergyModel');
const { analyzeMedicine, buildAnalysis, sanitizeAnalysisPayload } = require('./allergyController');
const { HYBRID_RULE_WEIGHT, HYBRID_ML_WEIGHT, RISK_THRESHOLDS } = require('../config/hybridScoring');

describe('normalised profile allergy matching', () => {
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test.each([
    ['Panadol', 'Paracetamol'],
    ['acetaminophen', 'Panadol'],
    ['Paracetamol', 'acetaminophen'],
    ['Panadol', 'Aspirin; Paracetamol\nPenicillin'],
  ])('%s matches allergy %s through final hybrid report', async (medicineName, knownAllergiesText) => {
    allergyModel.getProfile.mockResolvedValue({ age: 72, gender: 'Female', hasMedicineAllergy: true, knownAllergiesText });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await analyzeMedicine({ user: { id: 1 }, body: { medicineName } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    const { analysis } = res.json.mock.calls[0][0];
    expect(analysis.riskLevel).toBe('Dangerous');
    expect(analysis.dataUsed.p1ShortCircuited).toBe(true);
    expect(analysis.dataUsed.hybridGuardrailApplied).toBe('p1_direct_allergy_score_floor');
    expect(analysis.riskScore).toBeGreaterThanOrEqual(85);
    expect(analysis.recommendation).toContain('Do not take');
    expect(analysis.riskFactors).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'P1', score: 80, shortCircuit: true }),
    ]));
    expect(analysis.dataUsed.allergyEvidenceMatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceKey: 'known_allergies_text', matchedTerms: expect.arrayContaining(['acetaminophen']) }),
    ]));
    expect(analysis.riskReport.allergyConflicts.directAllergyMatch).toBe(true);
    expect(analysis.riskReport.safetyControls.proceedAllowed).toBe(false);
    expect(HYBRID_RULE_WEIGHT).toBe(0.6);
    expect(HYBRID_ML_WEIGHT).toBe(0.4);
    expect(RISK_THRESHOLDS).toEqual({ warningMin: 34, dangerousMin: 36 });
  });

  test('unrelated allergy does not trigger P1 and retains age rule', async () => {
    const analysis = await buildAnalysis(sanitizeAnalysisPayload({ medicineName: 'Panadol' }), {
      age: 72, gender: 'Female', knownAllergiesText: 'Penicillin',
    }, []);
    expect(analysis.riskFactors.some((factor) => factor.ruleId === 'P1')).toBe(false);
    expect(analysis.riskFactors.some((factor) => factor.ruleId === 'P11')).toBe(true);
  });

  test.each([
    ['Paracetamol', 'Panadol 5mg', 'panadol'],
    ['Metformin', 'Obmet 500mg', 'obmet'],
  ])('exposes same ingredient matches for %s in the API response', async (medicineName, currentMedicationsText, expected) => {
    allergyModel.getProfile.mockResolvedValue({ currentMedicationsText });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await analyzeMedicine({ user: { id: 1 }, body: { medicineName } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].analysis.medicationKnowledge.sameIngredientCurrentMedications)
      .toEqual([expected]);
  });

  test('preserves interaction rules without a direct allergy', async () => {
    const analysis = await buildAnalysis(sanitizeAnalysisPayload({ medicineName: 'Aspirin' }), {
      age: 72, gender: 'Female', knownAllergiesText: '', currentMedicationsText: 'Warfarin',
    }, []);
    expect(analysis.riskFactors.some((factor) => factor.ruleId === 'P1')).toBe(false);
    expect(analysis.riskFactors.some((factor) => factor.factorType === 'ddinter_interaction')).toBe(true);
    expect(analysis.riskLevel).toBe('Dangerous');
  });
});
