// Illustrative, manually reviewed software fixtures only; this is not a clinical
// or population accuracy benchmark. Expected states use the seven-class contract.
const { determineAnswerPolarity } = require('../../../src/services/answerPolarityService');
const { interpretContextualAnswer } = require('../../../src/services/contextualAnswerInterpretationService');

const genericQuestion = {
  questionText: 'How are you feeling today?',
  targetState: 'neutral',
  assessmentDimension: 'clarification',
};

const directCases = [
  ['happiness', 'I feel happy today'],
  ['happiness', 'I am glad today'],
  ['happiness', 'I feel cheerful today'],
  ['happiness', 'I feel joyful today'],
  ['happiness', 'I feel content today'],
  ['happiness', 'I feel delighted today'],
  ['happiness', 'I feel pleased today'],
  ['happiness', 'I am feeling good today'],
  ['happiness', 'I enjoyed spending time outside'],
  ['happiness', 'I felt a little joy today'],
  ['sadness', 'I feel sad today'],
  ['sadness', 'I am feeling down'],
  ['sadness', 'I feel unhappy today'],
  ['sadness', 'I have been feeling low'],
  ['sadness', 'I feel blue today'],
  ['sadness', 'My heart feels heavy'],
  ['sadness', 'I have felt empty today'],
  ['sadness', 'I feel hopeless'],
  ['sadness', 'I feel tearful today'],
  ['sadness', 'I am feeling gloomy'],
  ['loneliness', 'I feel lonely today'],
  ['loneliness', 'I feel alone today'],
  ['loneliness', 'I feel isolated today'],
  ['loneliness', 'I miss my family'],
  ['loneliness', 'I wish someone were here'],
  ['loneliness', 'I have no one to talk to'],
  ['loneliness', 'I feel left out'],
  ['loneliness', 'I have had no visitors'],
  ['loneliness', 'I feel socially disconnected'],
  ['loneliness', 'I miss talking with my daughter'],
  ['anxiety', 'I feel worried today'],
  ['anxiety', 'I am feeling anxious'],
  ['anxiety', 'I feel nervous today'],
  ['anxiety', 'I feel uneasy today'],
  ['anxiety', 'I feel stressed today'],
  ['anxiety', 'I feel overwhelmed'],
  ['anxiety', 'I feel afraid today'],
  ['anxiety', "I can't relax today"],
  ['anxiety', 'I am on edge today'],
  ['anxiety', 'I feel panicky today'],
  ['anger', 'I feel angry today'],
  ['anger', 'I am mad today'],
  ['anger', 'I feel frustrated today'],
  ['anger', 'I feel annoyed today'],
  ['anger', 'I feel irritated today'],
  ['anger', 'I feel upset about the delay'],
  ['anger', 'I feel furious today'],
  ['anger', 'I am fed up with this'],
  ['anger', 'I feel resentful today'],
  ['anger', 'I am angry about what happened'],
  ['cognitive_fog', 'I feel confused today'],
  ['cognitive_fog', 'My thinking feels foggy'],
  ['cognitive_fog', "I can't concentrate today"],
  ['cognitive_fog', "I lose track of what I'm doing"],
  ['cognitive_fog', 'I keep forgetting what I was doing'],
  ['cognitive_fog', 'I have trouble focusing'],
  ['cognitive_fog', 'I find it hard to follow conversations'],
  ['cognitive_fog', 'My thoughts feel unclear'],
  ['cognitive_fog', 'I am struggling to stay focused'],
  ['cognitive_fog', 'I feel mentally foggy'],
  ['neutral', "I'm fine"],
  ['neutral', 'I feel okay'],
  ['neutral', 'It is a normal day'],
  ['neutral', 'Nothing special happened'],
  ['neutral', 'The day was ordinary'],
  ['neutral', 'I feel the same as usual'],
  ['neutral', 'I am doing alright'],
  ['neutral', 'Not much happened today'],
  ['neutral', 'I feel steady today'],
  ['neutral', 'I do not have a strong feeling about it'],
];

const questionCases = [
  {
    name: 'affirmative answer to a worry question supports anxiety',
    question: { questionText: 'Did anything make you feel worried today?', targetState: 'anxiety', assessmentDimension: 'worry_calmness', positiveResponseEffect: 'supports:anxiety', negativeResponseEffect: 'opposes:anxiety' },
    answer: 'Yes, very worried.', expected: 'anxiety',
  },
  {
    name: 'negative answer to a worry question does not prove anxiety',
    question: { questionText: 'Have you been feeling worried?', targetState: 'anxiety', assessmentDimension: 'worry_calmness' },
    answer: 'No', previous: 'anxiety', expected: 'neutral',
  },
  {
    name: 'affirmative answer to a direct loneliness question supports loneliness',
    question: { questionText: 'Have you been feeling lonely?', targetState: 'loneliness', assessmentDimension: 'social_connection' },
    answer: 'Yes', expected: 'loneliness',
  },
  {
    name: 'negative answer to a direct loneliness question does not prove loneliness',
    question: { questionText: 'Are you feeling lonely?', targetState: 'loneliness', assessmentDimension: 'social_connection' },
    answer: 'No', previous: 'loneliness', expected: 'neutral',
  },
  {
    name: 'explicit happiness overrides a loneliness prompt',
    question: { questionText: 'Have you been feeling lonely?', targetState: 'loneliness', assessmentDimension: 'social_connection' },
    answer: 'No, I have been feeling happy.', expected: 'happiness',
  },
  {
    name: 'a direct worry statement is interpreted as anxiety',
    question: { questionText: 'Did worry make tasks harder?', targetState: 'anxiety', assessmentDimension: 'daily_engagement' },
    answer: 'I have been worried about my appointment.', expected: 'anxiety',
  },
  {
    name: 'indirect missing-family answer can support loneliness',
    question: genericQuestion,
    answer: 'I miss my family.', expected: 'loneliness',
  },
  {
    name: 'intermittent difficulty is weak cognitive-fog evidence and requests clarification',
    question: { questionText: 'Have you been feeling confused?', targetState: 'cognitive_fog', assessmentDimension: 'memory_concentration' },
    answer: "Sometimes, I lose track of what I'm doing.", expected: 'cognitive_fog', clarification: true,
  },
  {
    name: 'resolved loneliness is not treated as current loneliness',
    question: { questionText: 'Are you feeling lonely?', targetState: 'loneliness', assessmentDimension: 'social_connection' },
    answer: 'Not anymore.', expected: 'neutral',
  },
  {
    name: 'mixed happiness and anxiety asks for clarification',
    question: genericQuestion,
    answer: 'I feel happy but also worried.', expected: 'neutral', clarification: true,
  },
  {
    name: 'uncertain short answer asks for clarification',
    question: { questionText: 'Have you been worried?', targetState: 'anxiety', assessmentDimension: 'worry_calmness' },
    answer: 'I think so.', expected: 'neutral', clarification: true,
  },
  {
    name: 'no longer feeling lonely is not current loneliness',
    question: { questionText: 'Are you feeling lonely?', targetState: 'loneliness', assessmentDimension: 'social_connection' },
    answer: 'Not anymore.', expected: 'neutral', clarification: true,
  },
  {
    name: 'fine is not promoted to happiness by a positive-sounding prompt',
    question: { questionText: 'Was there anything pleasant today?', targetState: 'happiness', assessmentDimension: 'positive_protective_factor', positiveResponseEffect: 'supports:happiness' },
    answer: "I'm fine.", expected: 'neutral', clarification: true,
  },
];

const negationCases = [
  ['I am not lonely.', 'loneliness'],
  ['I am no longer sad.', 'sadness'],
  ['I am not happy.', 'happiness'],
  ["I don't feel worried anymore.", 'anxiety'],
  ['I am not angry, just tired.', 'anger'],
  ['I used to feel lonely, but now I feel better.', 'loneliness'],
];

function interpret(answerText, question = genericQuestion, options = {}) {
  const answerPolarity = determineAnswerPolarity(answerText, { detectedEmotion: options.rawEmotion || 'neutral' });
  return interpretContextualAnswer({
    question,
    answerText,
    answerPolarity,
    rawMlEmotion: options.rawEmotion || 'neutral',
    rawMlConfidence: options.confidence ?? 0.2,
    rawDetectionSource: options.source || 'ml_model',
    fallbackEmotion: options.fallbackEmotion || 'neutral',
    previousInterpretedEmotion: options.previous || 'neutral',
  });
}

describe('viva emotion interpretation fixtures (illustrative, not an accuracy benchmark)', () => {
  test.each(directCases)('%s direct example: %s', (expected, answer) => {
    expect(interpret(answer).interpretedEmotion).toBe(expected);
  });

  test.each(questionCases)('$name', ({ question, answer, expected, clarification, previous }) => {
    const result = interpret(answer, question, { previous });
    expect(result.interpretedEmotion).toBe(expected);
    if (clarification != null) expect(result.clarificationSuggested).toBe(clarification);
  });

  test.each(negationCases)('negation does not confirm %s as %s', (answer, negatedEmotion) => {
    const result = interpret(answer, genericQuestion, { rawEmotion: negatedEmotion, confidence: 0.85 });
    expect(result.interpretedEmotion).toBe('neutral');
  });

  test('preserves explicit alternative emotion when another class is negated', () => {
    expect(interpret('I am not lonely; I feel happy.', genericQuestion).interpretedEmotion).toBe('happiness');
  });
});

module.exports = { directCases, negationCases, questionCases };
