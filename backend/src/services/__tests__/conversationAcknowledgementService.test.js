const {
  ACKNOWLEDGEMENT_BANK,
  buildAcknowledgement,
  resolveCategory,
} = require('../conversationAcknowledgementService');

describe('deterministic conversation acknowledgement layer', () => {
  test('positive answer receives a safe positive acknowledgement', () => {
    const result = buildAcknowledgement({ answerPolarity: 'positive', detectedState: 'happiness', turnNumber: 1 });
    expect(result.category).toBe('positive');
    expect(ACKNOWLEDGEMENT_BANK.positive).toContain(result.message);
  });

  test('negative answer receives a supportive neutral acknowledgement (no diagnosis)', () => {
    const result = buildAcknowledgement({ answerPolarity: 'negative', detectedState: 'sadness', turnNumber: 1 });
    expect(result.category).toBe('concern');
    expect(ACKNOWLEDGEMENT_BANK.concern).toContain(result.message);
  });

  test('neutral answer receives a simple acknowledgement', () => {
    const result = buildAcknowledgement({ answerPolarity: 'neutral', detectedState: 'neutral', turnNumber: 1 });
    expect(result.category).toBe('neutral');
    expect(ACKNOWLEDGEMENT_BANK.neutral).toContain(result.message);
  });

  test('vague/unclear answers fall back to the simple bank', () => {
    const result = buildAcknowledgement({ answerPolarity: 'unclear', detectedState: 'neutral', turnNumber: 2 });
    expect(result.category).toBe('neutral');
  });

  test('concern-oriented emotional direction uses the concern bank even with unclear polarity', () => {
    const result = buildAcknowledgement({ answerPolarity: 'unclear', detectedState: 'anxiety', turnNumber: 1 });
    expect(result.category).toBe('concern');
  });

  test('no immediate repetition across consecutive turns', () => {
    let previous = null;
    const messages = [];
    for (let turn = 1; turn <= 5; turn += 1) {
      const result = buildAcknowledgement({
        answerPolarity: 'negative',
        detectedState: 'sadness',
        turnNumber: turn,
        previousAcknowledgement: previous,
      });
      expect(result.message).not.toBe(previous);
      messages.push(result.message);
      previous = result.message;
    }
    expect(new Set(messages).size).toBeGreaterThanOrEqual(2);
  });

  test('selection is deterministic for identical inputs', () => {
    const input = { answerPolarity: 'positive', detectedState: 'happiness', turnNumber: 3 };
    expect(buildAcknowledgement(input)).toEqual(buildAcknowledgement(input));
  });

  test('acknowledgements never diagnose, promise, or overclaim understanding', () => {
    const forbidden = [
      /understand exactly/i,
      /diagnos/i,
      /depress/i,
      /dementia/i,
      /alzheimer/i,
      /clinical/i,
      /medical/i,
      /guarantee/i,
      /cure/i,
      /treatment/i,
    ];
    Object.values(ACKNOWLEDGEMENT_BANK).flat().forEach((message) => {
      forbidden.forEach((pattern) => expect(message).not.toMatch(pattern));
    });
  });

  test('all acknowledgements are short and elder-friendly', () => {
    Object.values(ACKNOWLEDGEMENT_BANK).flat().forEach((message) => {
      expect(message.length).toBeLessThanOrEqual(60);
      expect(message.endsWith('.')).toBe(true);
    });
  });

  test('category resolution prioritizes explicit positive evidence', () => {
    expect(resolveCategory({ answerPolarity: 'positive', detectedState: 'happiness' })).toBe('positive');
    // A concern state with negative polarity stays in the concern bank.
    expect(resolveCategory({ answerPolarity: 'negative', detectedState: 'anger' })).toBe('concern');
    expect(resolveCategory({})).toBe('neutral');
  });
});