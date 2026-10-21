const {
  AdaptiveAggregationError,
  aggregateAdaptiveSessionResult,
} = require('../../../src/services/adaptiveResultAggregator');

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

function evidenceTurn(questionNumber, emotion, evidenceStrength, confidence = 0.65) {
  const explicit = evidenceStrength === 'explicit_self_report';
  const contextual = ['weak_contextual', 'contextual_supported'].includes(evidenceStrength);
  return {
    questionNumber,
    detectedState: emotion,
    detectionSource: 'ml_model',
    confidenceScore: confidence,
    userAnswer: 'A synthetic regression response',
    analysisMetadata: {
      contextualInterpretation: {
        evidenceSource: explicit ? 'explicit_self_report' : contextual ? 'question_context' : 'raw_ml_retained',
        evidenceStrength,
        explicitEvidenceWeight: explicit ? 1 : null,
        contextualEvidenceWeight: contextual ? 0.65 : null,
      },
    },
  };
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

  test('real-session regression gives direct anger more weight than each vague negative turn', () => {
    const session = [
      evidenceTurn(1, 'sadness', 'weak_contextual', 0.4087),
      evidenceTurn(2, 'sadness', 'weak_contextual', 0.4087),
      evidenceTurn(3, 'anger', 'explicit_self_report', 0.5355),
      evidenceTurn(4, 'sadness', 'strong_ml', 0.3721),
      evidenceTurn(5, 'sadness', 'strong_ml', 0.5528),
    ];
    const result = aggregateAdaptiveSessionResult(session);
    const evidence = result.explanation.turnEvidence;
    expect(evidence[2].weightedEvidence).toBeGreaterThan(evidence[0].weightedEvidence);
    expect(evidence[2].weightedEvidence).toBeGreaterThan(evidence[1].weightedEvidence);
    expect(result).toMatchObject({ finalEmotionalState: 'anger', explanation: { explicitLeader: true } });
  });

  test('repeated direct and contextual sadness can still outweigh one explicit anger turn', () => {
    const result = aggregateAdaptiveSessionResult([
      evidenceTurn(1, 'sadness', 'explicit_self_report'),
      evidenceTurn(2, 'sadness', 'explicit_self_report'),
      evidenceTurn(3, 'sadness', 'weak_contextual'),
      evidenceTurn(4, 'sadness', 'weak_contextual'),
      evidenceTurn(5, 'anger', 'explicit_self_report'),
    ]);
    expect(result.finalEmotionalState).toBe('sadness');
    expect(result.explanation.runnerUpEmotion).toBe('anger');
  });

  test('anger-dominant explicit evidence remains a strong candidate across all five turns', () => {
    const result = aggregateAdaptiveSessionResult([
      evidenceTurn(1, 'sadness', 'weak_contextual'),
      evidenceTurn(2, 'neutral', 'strong_ml', 0.5),
      evidenceTurn(3, 'anger', 'explicit_self_report'),
      evidenceTurn(4, 'anger', 'explicit_self_report'),
      evidenceTurn(5, 'anger', 'strong_ml', 0.7),
    ]);
    expect(result.finalEmotionalState).toBe('anger');
  });

  test('loneliness remains distinct from generic sadness', () => {
    const result = aggregateAdaptiveSessionResult([
      evidenceTurn(1, 'sadness', 'weak_contextual'),
      evidenceTurn(2, 'loneliness', 'explicit_self_report'),
      evidenceTurn(3, 'loneliness', 'contextual_supported'),
      evidenceTurn(4, 'loneliness', 'strong_ml', 0.7),
      evidenceTurn(5, 'loneliness', 'contextual_supported'),
    ]);
    expect(result.finalEmotionalState).toBe('loneliness');
  });
});
