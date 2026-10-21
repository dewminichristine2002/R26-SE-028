const { scoreObjectiveResponse } = require('../../../src/services/cognitiveActivityScoringService');
const { BANK } = require('../../../src/data/cognitiveActivityBank');

function answerFor(item, correct = true) {
  if (item.kind === 'multi_recall') return { itemId: item.id, selectedAnswers: correct ? item.correctAnswers : [item.options.find((option) => !item.correctAnswers.includes(option.id)).id] };
  if (item.kind === 'ordering') return { itemId: item.id, orderedAnswers: correct ? item.correctOrder : [...item.correctOrder].reverse() };
  if (/^Complete the word\s*:/i.test(item.prompt)) {
    const puzzle = item.prompt.split(':').pop().replace(/\s+/g, '');
    const answer = item.correctAnswer;
    const index = puzzle.indexOf('_');
    return { itemId: item.id, selectedAnswer: correct ? answer[index] : (answer[index] === 'a' ? 'b' : 'a') };
  }
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

  test('a skipped round is excluded from accuracy rather than counted as incorrect', () => {
    const items = BANK.odd_one_out.easy.slice(0, 2);
    const itemResponses = [answerFor(items[0], true), { itemId: items[1].id, skipped: true }];
    expect(scoreObjectiveResponse({ items }, { itemResponses })).toMatchObject({ accuracy: 1, correctCount: 1, completedCount: 1 });
  });

  test.each([
    ['wd_m3', 'O', true], ['wd_m3', 'o', true], ['wd_m3', 'A', false],
    ['wd_e1', 'A', true], ['wd_h1', 'A', true], ['wd_h3', 'r', true],
  ])('word completion prompt %s scores typed letter %s', (itemId, answer, isCorrect) => {
    const item = Object.values(BANK.word_completion).flat().find((entry) => entry.id === itemId);
    expect(scoreObjectiveResponse({ activityType: 'word_completion', items: [item] }, { itemResponses: [{ itemId, selectedAnswer: answer }] })).toMatchObject({ accuracy: isCorrect ? 1 : 0, isCorrect });
  });

  test.each([
    ['', 'Please enter the missing letter.'], ['   ', 'Please enter the missing letter.'], ['morning', 'Please enter one letter only.'],
  ])('word completion rejects invalid typed answer %j with clear validation', (answer, message) => {
    const item = BANK.word_completion.medium[2];
    expect(() => scoreObjectiveResponse({ activityType: 'word_completion', items: [item] }, { itemResponses: [{ itemId: item.id, selectedAnswer: answer }] })).toThrow(message);
  });

  test.each(['word_completion', 'odd_one_out', 'short_memory_recall'])('%s has five hard questions and server-side answer keys', (activityType) => {
    expect(BANK[activityType].hard).toHaveLength(5);
    expect(BANK[activityType].hard.every((item) => item.id && item.prompt)).toBe(true);
  });

  test('rejects missing items and answers outside visible options', () => {
    const item = BANK.word_category.easy[0];
    expect(() => scoreObjectiveResponse({ items: [item] }, { itemResponses: [] })).toThrow('Responses for all');
    expect(() => scoreObjectiveResponse({ items: [item] }, { itemResponses: [{ itemId: item.id, selectedAnswer: 'hidden-answer' }] })).toThrow('valid answer option');
  });
});
