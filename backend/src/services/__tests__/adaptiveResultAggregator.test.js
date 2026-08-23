const {
  AdaptiveAggregationError,
  aggregateAdaptiveSessionResult,
} = require('../adaptiveResultAggregator');

function turns(states, options = {}) {
  return states.map((detectedState, index) => ({
    questionNumber: index + 1,
    detectedState,
    detectionSource: options.sources?.[index] || 'ml_model',
    confidenceScore: (options.sources?.[index] || 'ml_model') === 'ml_model' ? options.confidences?.[index] ?? 0.7 : null,
    analysisMetadata: (options.sources?.[index] || 'ml_model') === 'rule_fallback' ? { ruleScore: 1 } : null,
    userAnswer: options.answers?.[index] || 'A meaningful synthetic answer',
  }));
}

describe('adaptive five-turn result aggregation', () => {
  test('A: Q5 neutral does not dominate four happiness turns', () => {
    expect(aggregateAdaptiveSessionResult(turns(['happiness', 'happiness', 'happiness', 'happiness', 'neutral'])).finalEmotionalState).toBe('happiness');
  });

  test('B: repeated concern outweighs neutral evidence', () => {
    expect(aggregateAdaptiveSessionResult(turns(['sadness', 'sadness', 'neutral', 'sadness', 'neutral'])).finalEmotionalState).toBe('sadness');
  });

  test('C: modest recency lets later improvement win', () => {
    expect(aggregateAdaptiveSessionResult(turns(['loneliness', 'loneliness', 'happiness', 'happiness', 'happiness'])).finalEmotionalState).toBe('happiness');
  });

  test('D: later deterioration wins accumulated evidence', () => {
    expect(aggregateAdaptiveSessionResult(turns(['happiness', 'neutral', 'sadness', 'sadness', 'sadness'])).finalEmotionalState).toBe('sadness');
  });

  test('E: rule evidence contributes without becoming model confidence', () => {
    const result = aggregateAdaptiveSessionResult(turns(
      ['sadness', 'sadness', 'neutral', 'sadness', 'neutral'],
      { sources: ['ml_model', 'rule_fallback', 'rule_fallback', 'ml_model', 'rule_fallback'] }
    ));
    const fallback = result.explanation.turnEvidence[1];
    expect(fallback).toMatchObject({ modelConfidence: null, ruleEvidenceWeight: 0.55 });
    expect(result.finalConfidence).toBeGreaterThanOrEqual(0);
    expect(result.finalConfidence).toBeLessThanOrEqual(1);
  });

  test('F: all-neutral session remains neutral with low-risk-compatible state', () => {
    expect(aggregateAdaptiveSessionResult(turns(Array(5).fill('neutral')))).toMatchObject({ finalEmotionalState: 'neutral', baseRiskLevel: 'low' });
  });

  test('G: effectively tied top evidence becomes neutral and ambiguous', () => {
    const result = aggregateAdaptiveSessionResult(turns(
      ['happiness', 'sadness', 'happiness', 'sadness', 'neutral'],
      { confidences: [0.7, 0.7, 0.7, 0.7, 0.1] }
    ));
    expect(result).toMatchObject({ finalEmotionalState: 'neutral', explanation: { ambiguous: true } });
  });

  test('H: confidence is bounded for representative sessions', () => {
    [['neutral', 'neutral', 'neutral', 'neutral', 'neutral'], ['anger', 'sadness', 'anger', 'neutral', 'anger']].forEach((states) => {
      const value = aggregateAdaptiveSessionResult(turns(states)).finalConfidence;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  test.each([4, 6])('I: rejects %i turns', (count) => {
    expect(() => aggregateAdaptiveSessionResult(turns(Array(count).fill('neutral')))).toThrow(AdaptiveAggregationError);
  });

  test('J: rejects unsupported states', () => {
    expect(() => aggregateAdaptiveSessionResult(turns(['neutral', 'neutral', 'surprise', 'neutral', 'neutral']))).toThrow('Unsupported adaptive emotion');
  });

  test('derives conversation engagement only from meaningful response presence', () => {
    expect(aggregateAdaptiveSessionResult(turns(Array(5).fill('neutral'), { answers: ['yes', 'no', 'three useful words', 'another useful response', 'fine'] })).conversationEngagement).toBe('partially_engaged');
  });
});
