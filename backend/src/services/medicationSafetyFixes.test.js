jest.mock('./drugNormalizationService', () => ({
  canonicalizeDrugName: jest.fn(async (input) => ({ ingredientName: input, source: 'fallback' })),
}));
jest.mock('../data/medicationKnowledge', () => ({
  RXNORM_DRUGS: [],
  DDINTER_INTERACTIONS: [
    { drugA: 'diazepam', drugB: 'oxymorphone', severity: 'high', description: 'Fixture' },
    { drugA: 'diazepam', drugB: 'temazepam', severity: 'high', description: 'Fixture' },
    { drugA: 'diazepam', drugB: 'lorazepam', severity: 'high', description: 'Fixture' },
  ],
}));
const { enrichMedication, resolveMedication } = require('./medicationKnowledgeService');
const { getClinicalAction } = require('./riskReportService');

test.each([
  ['acetaminophen', 'Panadol 500mg'],
  ['Panadol', 'paracetamol 500 mg'],
  ['metformin', 'Obmet 500mg'],
])('compares canonical ingredients for %s and %s', async (medicineName, currentMedicationsText) => {
  const result = await enrichMedication({ medicineName, currentMedicationsText });
  expect(result.sameIngredientCurrentMedications).toHaveLength(1);
});

test('retrieves every supplied Diazepam pair after dosage and brand normalization', async () => {
  const result = await enrichMedication({
    medicineName: 'Diazepam', currentMedicationsText: 'Opana 20mg, temazepam 10mg; lorazepam 1mg',
  });
  expect(result.interactions.map((item) => item.interactingNormalizedDrug).sort())
    .toEqual(['lorazepam', 'oxymorphone', 'temazepam']);
});

test('unresolved fallback does not claim a match', async () => {
  expect(await resolveMedication('zzzzunknownmedicine')).toMatchObject({
    matched: false, normalizationConfidence: 0, normalizationSource: 'UNRESOLVED_FALLBACK',
  });
});

test('safe action logs the check without claiming an interaction', () => {
  expect(getClinicalAction('Safe').action).toBe('Proceed as directed; log safety check');
});
