const { scoreObjectiveResponse } = require('../cognitiveActivityScoringService');

describe('objective cognitive activity scoring', () => {
  const single = { kind: 'single_choice', options: ['Apple', 'Banana', 'Carrot'], correctAnswer: 'Carrot' };
  test('A: correct single answer has accuracy 1', () => expect(scoreObjectiveResponse(single, { selectedAnswer: 'Carrot' })).toMatchObject({ accuracy: 1, isCorrect: true }));
  test('B: incorrect single answer has accuracy 0', () => expect(scoreObjectiveResponse(single, { selectedAnswer: 'Apple' })).toMatchObject({ accuracy: 0, isCorrect: false }));
  test('C: multi-item recall scores three of four as 0.75', () => {
    const task = { kind: 'multi_recall', options: ['Book', 'Cup', 'Key', 'Flower'], correctAnswers: ['Book', 'Cup', 'Key', 'Flower'] };
    expect(scoreObjectiveResponse(task, { selectedAnswers: ['Book', 'Cup', 'Key'] }).accuracy).toBe(0.75);
  });
  test('F: invalid answer is rejected', () => expect(() => scoreObjectiveResponse(single, { selectedAnswer: 'Not an option' })).toThrow('valid answer option'));
});
