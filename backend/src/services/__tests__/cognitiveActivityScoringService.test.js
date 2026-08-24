const { scoreObjectiveResponse } = require('../cognitiveActivityScoringService');
const { BANK } = require('../../data/cognitiveActivityBank');

function answerFor(item, correct = true) {
  if (item.kind === 'multi_recall') return { itemId: item.id, selectedAnswers: correct ? item.correctAnswers : [item.options.find((option) => !item.correctAnswers.includes(option.id)).id] };
  if (item.kind === 'ordering') return { itemId: item.id, orderedAnswers: correct ? item.correctOrder : [...item.correctOrder].reverse() };
  return { itemId: item.id, selectedAnswer: correct ? item.correctAnswer : item.options.find((option) => option.id !== item.correctAnswer).id };
}

describe('objective cognitive activity scoring', () => {
  test.each(Object.keys(BANK))('%s scores correct and incorrect responses server-side', (activityType) => {
    const item = BANK[activityType].easy[0];
    expect(scoreObjectiveResponse({ items: [item] }, { itemResponses: [answerFor(item, true)] })).toMatchObject({ accuracy: 1, isCorrect: true });
    expect(scoreObjectiveResponse({ items: [item] }, { itemResponses: [answerFor(item, false)] }).accuracy).toBe(0);
  });

  test.each([[3, 3, 1], [4, 3, 0.75], [4, 2, 0.5]])('%i items with %i correct gives %f accuracy', (count, correctCount, accuracy) => {
    const items = BANK.word_category.medium.slice(0, count);
    const itemResponses = items.map((item, index) => answerFor(item, index < correctCount));
    expect(scoreObjectiveResponse({ items }, { itemResponses, accuracy: 1, score: 100, isCorrect: true }).accuracy).toBe(accuracy);
  });

  test('memory recall subtracts incorrect selections and clamps to 0..1', () => {
    const item = BANK.short_memory_recall.easy[0];
    const distractor = item.options.find((option) => !item.correctAnswers.includes(option.id)).id;
    expect(scoreObjectiveResponse({ items: [item] }, { itemResponses: [{ itemId: item.id, selectedAnswers: [...item.correctAnswers, distractor] }] }).accuracy).toBe(0.6667);
    expect(scoreObjectiveResponse({ items: [item] }, { itemResponses: [{ itemId: item.id, selectedAnswers: [distractor] }] }).accuracy).toBe(0);
  });

  test('rejects missing items and answers outside visible options', () => {
    const item = BANK.word_category.easy[0];
    expect(() => scoreObjectiveResponse({ items: [item] }, { itemResponses: [] })).toThrow('Responses for all');
    expect(() => scoreObjectiveResponse({ items: [item] }, { itemResponses: [{ itemId: item.id, selectedAnswer: 'hidden-answer' }] })).toThrow('valid answer option');
  });
});
