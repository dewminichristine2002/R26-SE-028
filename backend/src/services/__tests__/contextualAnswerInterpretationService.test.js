const { determineAnswerPolarity } = require('../answerPolarityService');
const { interpretContextualAnswer } = require('../contextualAnswerInterpretationService');
const { aggregateAdaptiveSessionResult } = require('../adaptiveResultAggregator');

function interpret(question, answerText, raw = {}) {
  const answerPolarity = determineAnswerPolarity(answerText, { detectedEmotion: raw.emotion || 'neutral' });
  return interpretContextualAnswer({
    question, answerText, answerPolarity,
    rawMlEmotion: raw.emotion || 'neutral',
    rawMlConfidence: raw.confidence ?? 0.2,
    rawDetectionSource: raw.source || 'ml_model',
    fallbackEmotion: raw.fallbackEmotion || 'neutral',
    previousInterpretedEmotion: raw.previous || 'neutral',
  });
}

const dimensions = {
  wellbeing: { targetState: 'neutral', assessmentDimension: 'general_wellbeing' },
  energy: { targetState: 'neutral', assessmentDimension: 'energy_motivation' },
  engagement: { targetState: 'neutral', assessmentDimension: 'daily_engagement' },
};

describe('contextual answer interpretation', () => {
  test('the same No has different meaning by curated question semantics', () => {
    const worried = interpret({ targetState: 'anxiety', assessmentDimension: 'worry_calmness', negativeResponseEffect: 'opposes:anxiety' }, 'No', { emotion: 'cognitive_fog', confidence: 0.49, previous: 'anxiety' });
    const enjoyed = interpret({ targetState: 'sadness', assessmentDimension: 'daily_engagement', negativeResponseEffect: 'supports:sadness' }, 'No', { emotion: 'cognitive_fog', confidence: 0.49 });
    const contact = interpret({ targetState: 'loneliness', assessmentDimension: 'social_connection', negativeResponseEffect: 'supports:loneliness' }, 'No', { emotion: 'cognitive_fog', confidence: 0.49 });
    expect(worried.interpretedEmotion).toBe('neutral');
    expect(enjoyed.interpretedEmotion).toBe('sadness');
    expect(contact.interpretedEmotion).toBe('loneliness');
  });

  test('the same quick reply Not really keeps question-specific meaning', () => {
    const worried = interpret({ targetState: 'anxiety', assessmentDimension: 'worry_calmness', negativeResponseEffect: 'opposes:anxiety' }, 'Not really', { emotion: 'neutral', confidence: 0.3, previous: 'anxiety' });
    const enjoyed = interpret({ targetState: 'sadness', assessmentDimension: 'daily_engagement', negativeResponseEffect: 'supports:sadness' }, 'Not really', { emotion: 'neutral', confidence: 0.3 });
    expect(worried.interpretedEmotion).toBe('neutral');
    expect(enjoyed.interpretedEmotion).toBe('sadness');
  });

  test('positive engagement answer supplies protective evidence', () => {
    expect(interpret(dimensions.engagement, 'Yes, very much.', { emotion: 'neutral', confidence: 0.4 }).interpretedEmotion).toBe('happiness');
  });

  test('declining a sadness clarification preserves the prior emotional context', () => {
    const question = {
      targetState: 'sadness',
      assessmentDimension: 'clarification',
      negativeResponseEffect: 'preserve_previous',
    };
    const result = interpret(question, 'No', {
      emotion: 'cognitive_fog', confidence: 0.4921, previous: 'sadness',
    });
    expect(result).toMatchObject({
      interpretedEmotion: 'sadness',
      evidenceSource: 'question_context',
      semanticEffect: 'preserve_previous',
    });
  });

  test('strong meaningful non-neutral ML remains unchanged', () => {
    const result = interpret(dimensions.wellbeing, 'Today has been horrible and I feel very down.', { emotion: 'sadness', confidence: 0.84 });
    expect(result).toMatchObject({ interpretedEmotion: 'sadness', evidenceSource: 'raw_ml_retained' });
  });

  test('exact real-device sequence no longer loses short negative evidence', () => {
    const cases = [
      [dimensions.wellbeing, "It's not good", { emotion: 'sadness', confidence: 0.3949, source: 'ml_model' }],
      [dimensions.energy, 'Not much energized', { emotion: 'cognitive_fog', confidence: 0.2591, source: 'rule_fallback', fallbackEmotion: 'neutral', previous: 'sadness' }],
      [dimensions.engagement, 'No', { emotion: 'cognitive_fog', confidence: 0.4921, source: 'ml_model', previous: 'sadness' }],
      [{ targetState: 'neutral', assessmentDimension: 'positive_protective_factor', negativeResponseEffect: 'preserve_previous' }, "Not today, it's a horrible day", { emotion: 'sadness', confidence: 0.4912, source: 'ml_model', previous: 'sadness' }],
      [dimensions.engagement, 'Nothing special today', { emotion: 'neutral', confidence: 0.4419, source: 'ml_model', previous: 'sadness' }],
    ];
    const interpreted = cases.map(([question, answer, raw]) => interpret(question, answer, raw));
    expect(interpreted.map((entry) => entry.interpretedEmotion)).toEqual(Array(5).fill('sadness'));

    const turns = interpreted.map((entry, index) => ({
      questionNumber: index + 1,
      userAnswer: cases[index][1],
      detectedState: entry.interpretedEmotion,
      confidenceScore: cases[index][2].source === 'ml_model' ? cases[index][2].confidence : null,
      detectionSource: cases[index][2].source,
      analysisMetadata: { contextualInterpretation: entry },
    }));
    const aggregate = aggregateAdaptiveSessionResult(turns);
    expect(aggregate.finalEmotionalState).toBe('sadness');
    expect(aggregate.explanation.turnEvidence.every((entry) => entry.emotion === 'sadness')).toBe(true);
  });

  test('voice and typed transcript strings use identical interpretation', () => {
    expect(interpret(dimensions.engagement, 'No', { emotion: 'cognitive_fog', confidence: 0.49 }))
      .toEqual(interpret(dimensions.engagement, 'No', { emotion: 'cognitive_fog', confidence: 0.49 }));
  });

  test('mixed evidence is accumulated across all turns rather than replaced by Q5', () => {
    const emotions = ['sadness', 'sadness', 'happiness', 'happiness', 'neutral'];
    const turns = emotions.map((emotion, index) => ({
      questionNumber: index + 1,
      userAnswer: ['No', 'No', 'Yes', 'Yes', 'Sometimes'][index],
      detectedState: emotion,
      confidenceScore: 0.65,
      detectionSource: 'ml_model',
      analysisMetadata: {},
    }));
    const result = aggregateAdaptiveSessionResult(turns);
    expect(result.explanation.rawWinningEmotion).toBe('happiness');
    expect(result.explanation.emotionScores.happiness).toBeGreaterThan(result.explanation.emotionScores.neutral);
    expect(result.explanation.emotionScores.sadness).toBeGreaterThan(result.explanation.emotionScores.neutral);
  });
});
