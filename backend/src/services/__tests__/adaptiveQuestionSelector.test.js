const {
  SCORE_WEIGHTS,
  determineTargetState,
  selectFirstAdaptiveQuestion,
  selectNextAdaptiveQuestion,
} = require('../adaptiveQuestionSelector');
const { determineAnswerPolarity } = require('../answerPolarityService');

function question(code, state, dimension, overrides = {}) {
  return {
    questionId: overrides.questionId || code.length,
    questionCode: code,
    questionText: overrides.questionText || code,
    targetState: state,
    assessmentDimension: dimension,
    phase: overrides.phase || 'adaptive',
    priority: overrides.priority || 1,
    isActive: overrides.isActive ?? true,
    isAssessment: overrides.isAssessment ?? true,
    questionType: overrides.questionType || 'follow_up',
    ...overrides,
  };
}

const bank = [
  question('open_general', 'neutral', 'general_wellbeing', { questionId: 1, phase: 'opening' }),
  question('neutral_energy', 'neutral', 'energy_motivation', { questionId: 2 }),
  question('neutral_engagement', 'neutral', 'daily_engagement', { questionId: 3 }),
  question('neutral_positive', 'neutral', 'positive_protective_factor', { questionId: 4 }),
  question('neutral_clarify', 'neutral', 'clarification', { questionId: 5 }),
  question('lonely_contact', 'loneliness', 'social_connection', {
    questionId: 6,
    positiveNextCode: 'lonely_protective',
    negativeNextCode: 'lonely_clarify',
    neutralNextCode: 'neutral_clarify',
  }),
  question('lonely_protective', 'loneliness', 'positive_protective_factor', { questionId: 7 }),
  question('lonely_clarify', 'loneliness', 'clarification', { questionId: 8 }),
  question('lonely_engagement', 'loneliness', 'daily_engagement', { questionId: 9 }),
  question('happy_engagement', 'happiness', 'daily_engagement', { questionId: 10 }),
  question('happy_protective', 'happiness', 'positive_protective_factor', { questionId: 11 }),
  question('anxiety_worry', 'anxiety', 'worry_calmness', { questionId: 12 }),
  question('breathing_offer', 'anxiety', null, { questionId: 13, isAssessment: false, questionType: 'activity_offer' }),
];

function repositoryFor(questions = bank) {
  return {
    getAssessmentCandidates: jest.fn(async ({ targetState, excludedQuestionIds = [], excludedQuestionCodes = [] }) =>
      questions.filter((item) => item.targetState === targetState && item.isActive && item.isAssessment &&
        !excludedQuestionIds.includes(item.questionId) && !excludedQuestionCodes.includes(item.questionCode))),
    getNeutralAssessmentCandidates: jest.fn(async ({ excludedQuestionIds = [], excludedQuestionCodes = [] } = {}) =>
      questions.filter((item) => item.targetState === 'neutral' && item.isActive && item.isAssessment &&
        !excludedQuestionIds.includes(item.questionId) && !excludedQuestionCodes.includes(item.questionCode))),
    getBranchQuestion: jest.fn(async (code) => questions.find((item) => item.questionCode === code && item.isActive && item.isAssessment) || null),
  };
}

function nextContext(overrides = {}) {
  return {
    nextQuestionNumber: 2,
    detectedEmotion: 'neutral',
    confidence: 0,
    answerPolarity: 'neutral',
    recentEmotionHistory: [],
    askedQuestionIds: [],
    askedQuestionCodes: [],
    askedDimensions: [],
    ...overrides,
  };
}

describe('adaptiveQuestionSelector', () => {
  test('A: no history selects a neutral general assessment opening', async () => {
    const result = await selectFirstAdaptiveQuestion({ userId: 1, recentEmotionHistory: [] }, repositoryFor());
    expect(result.question.questionCode).toBe('open_general');
    expect(result.question.targetState).toBe('neutral');
    expect(result.question.isAssessment).toBe(true);
  });

  test('B: repeated loneliness history permits a loneliness assessment Q1', async () => {
    const result = await selectFirstAdaptiveQuestion({
      userId: 1,
      recentEmotionHistory: ['loneliness', 'loneliness', 'neutral'],
    }, repositoryFor());
    expect(result.question.targetState).toBe('loneliness');
    expect(result.question.isAssessment).toBe(true);
  });

  test('C: an asked question cannot be selected again', async () => {
    const result = await selectNextAdaptiveQuestion(nextContext({
      detectedEmotion: 'loneliness', confidence: 0.8,
      askedQuestionIds: [6], askedQuestionCodes: ['lonely_contact'],
    }), repositoryFor());
    expect(result.question.questionCode).not.toBe('lonely_contact');
  });

  test.each([
    ['D: positive branch', 'positive', 'lonely_protective'],
    ['E: negative branch', 'negative', 'lonely_clarify'],
    ['F: neutral branch', 'neutral', 'neutral_clarify'],
  ])('%s receives strong preference', async (_name, polarity, expectedCode) => {
    const previousQuestion = bank.find((item) => item.questionCode === 'lonely_contact');
    const result = await selectNextAdaptiveQuestion(nextContext({
      previousQuestion,
      answerPolarity: polarity,
      detectedEmotion: polarity === 'neutral' ? 'neutral' : 'loneliness',
      confidence: polarity === 'neutral' ? 0 : 0.8,
      askedQuestionIds: [6], askedQuestionCodes: ['lonely_contact'],
    }), repositoryFor());
    expect(result.question.questionCode).toBe(expectedCode);
    expect(result.selectionReason.scoreBreakdown.branchMatch).toBe(SCORE_WEIGHTS.POLARITY_BRANCH_MATCH);
  });

  test('G: strong happiness evidence overrides an old loneliness branch', async () => {
    const previousQuestion = bank.find((item) => item.questionCode === 'lonely_contact');
    const result = await selectNextAdaptiveQuestion(nextContext({
      previousQuestion,
      answerPolarity: 'positive',
      detectedEmotion: 'happiness',
      confidence: 0.84,
      recentEmotionHistory: ['loneliness', 'loneliness'],
      askedQuestionIds: [6],
      askedQuestionCodes: ['lonely_contact'],
    }), repositoryFor());
    expect(result.question.targetState).toBe('happiness');
  });

  test('H: neutral does not inherit previous loneliness', async () => {
    const target = determineTargetState(nextContext({ detectedEmotion: 'neutral', confidence: 0, recentEmotionHistory: ['loneliness', 'loneliness'] }));
    expect(target.targetState).toBe('neutral');
    const result = await selectNextAdaptiveQuestion(nextContext({
      detectedEmotion: 'neutral', confidence: 0, recentEmotionHistory: ['loneliness', 'loneliness'],
    }), repositoryFor());
    expect(result.question.targetState).toBe('neutral');
  });

  test('I: a new relevant dimension beats an otherwise equal repeated dimension', async () => {
    const result = await selectNextAdaptiveQuestion(nextContext({
      detectedEmotion: 'happiness', confidence: 0.8, askedDimensions: ['daily_engagement'],
    }), repositoryFor());
    expect(result.question.questionCode).toBe('happy_protective');
  });

  test('J: non-assessment activity prompts are invalid', async () => {
    const result = await selectNextAdaptiveQuestion(nextContext({ detectedEmotion: 'anxiety', confidence: 0.8 }), repositoryFor());
    expect(result.question.questionCode).toBe('anxiety_worry');
    expect(result.question.questionType).not.toBe('activity_offer');
  });

  test('K: identical context always produces identical output', async () => {
    const repo = repositoryFor();
    const context = nextContext({ detectedEmotion: 'loneliness', confidence: 0.8 });
    const codes = await Promise.all(Array.from({ length: 10 }, async () => (await selectNextAdaptiveQuestion(context, repo)).question.questionCode));
    expect(new Set(codes).size).toBe(1);
  });

  test('L: five-turn simulation produces five unique assessments and no Q6', async () => {
    const repo = repositoryFor();
    const first = await selectFirstAdaptiveQuestion({ userId: 1, recentEmotionHistory: [] }, repo);
    const selected = [first.question];
    for (let number = 2; number <= 5; number += 1) {
      const result = await selectNextAdaptiveQuestion(nextContext({
        nextQuestionNumber: number,
        askedQuestionIds: selected.map((item) => item.questionId),
        askedQuestionCodes: selected.map((item) => item.questionCode),
        askedDimensions: selected.map((item) => item.assessmentDimension),
      }), repo);
      selected.push(result.question);
    }
    expect(selected).toHaveLength(5);
    expect(new Set(selected.map((item) => item.questionCode)).size).toBe(5);
    expect(selected.every((item) => item.isAssessment)).toBe(true);
    expect(await selectNextAdaptiveQuestion(nextContext({ nextQuestionNumber: 6 }), repo)).toBeNull();
  });
});

describe('answer polarity', () => {
  test('uses meaning rather than literal yes/no', () => {
    expect(determineAnswerPolarity('Yes, my daughter called and I felt much better.')).toBe('positive');
    expect(determineAnswerPolarity('Yes, someone called, but I still felt very lonely.', { detectedEmotion: 'loneliness' })).toBe('negative');
    expect(determineAnswerPolarity('No, but I was happy spending time reading.')).toBe('positive');
  });
});
