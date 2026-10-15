jest.mock('../../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../../src/models/routineModel', () => ({
  saveRoutine: jest.fn(),
}));

const {
  buildConfirmationAnswer,
  parseAgenticAction,
} = require('../../../src/services/assistantAgenticActionService');

describe('assistant agentic routine actions', () => {
  test.each([
    ['set the dinner time to 10:00 p.m.'],
    ['set the dinner time to 10:00 pm'],
    ['set the dinner time to 10 p m'],
    ['set the dinner time to 10.00 P.M.'],
  ])('preserves dotted and spoken PM in "%s"', (message) => {
    const result = parseAgenticAction(message);

    expect(result?.action).toMatchObject({
      domain: 'routine',
      operation: 'update',
      payload: {
        mealKey: 'dinner',
        time: '10:00 PM',
      },
      summary: 'Set Dinner to 10:00 PM.',
    });
    expect(buildConfirmationAnswer(result.action)).toContain('Set Dinner to 10:00 PM.');
  });

  test('defaults dinner to PM when the meridiem is omitted', () => {
    const result = parseAgenticAction('set dinner time to 10:00');

    expect(result?.action?.payload).toMatchObject({
      mealKey: 'dinner',
      time: '10:00 PM',
    });
  });

  test('keeps breakfast defaulting to AM when the meridiem is omitted', () => {
    const result = parseAgenticAction('set breakfast time to 8:00');

    expect(result?.action?.payload).toMatchObject({
      mealKey: 'breakfast',
      time: '08:00 AM',
    });
  });
});
