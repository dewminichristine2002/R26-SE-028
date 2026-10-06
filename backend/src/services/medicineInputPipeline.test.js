jest.mock('./medicationKnowledgeService', () => ({
  resolveMedication: jest.fn().mockResolvedValue({ matched: true, normalizedName: 'acetaminophen' }),
}));
jest.mock('./drugClassLookupService', () => ({ resolveDrugClass: jest.fn().mockReturnValue(null) }));
const { buildPipelineReport } = require('./medicineInputPipeline');

test('counts final retrieved side effects independently of symptom matches and earlier count', async () => {
  const report = await buildPipelineReport({
    medicationKnowledge: {
      commonSideEffects: Array.from({ length: 15 }, (_, index) => `effect ${index}`),
      sideEffectMatches: [], sideEffectCount: 0,
    },
  });
  expect(report.stages.find((stage) => stage.id === 'knowledge_query').detail.sideEffectCount).toBe(15);
});

test('uses the final count when the retrieved list is unavailable', async () => {
  const report = await buildPipelineReport({ medicationKnowledge: { sideEffectCount: 15, sideEffectMatches: [] } });
  expect(report.stages.find((stage) => stage.id === 'knowledge_query').detail.sideEffectCount).toBe(15);
});
