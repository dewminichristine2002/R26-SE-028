const { findExplicitEmotionEvidence } = require('../../../src/services/explicitEmotionEvidenceService');

describe('explicit first-person emotion evidence', () => {
  test.each([
    ['I feel angry.', 'anger'],
    ['I am angry with my family.', 'anger'],
    ["I'm frustrated with what happened.", 'anger'],
    ['I feel really mad about it.', 'anger'],
    ['I feel sad.', 'sadness'],
    ["I've been feeling down.", 'sadness'],
    ['I feel very unhappy.', 'sadness'],
    ['I feel lonely.', 'loneliness'],
    ['I feel alone today.', 'loneliness'],
    ["I've been feeling isolated.", 'loneliness'],
    ['I feel anxious.', 'anxiety'],
    ["I've been very worried today.", 'anxiety'],
    ['I feel nervous about everything.', 'anxiety'],
    ['I feel happy today.', 'happiness'],
    ["I'm feeling cheerful.", 'happiness'],
    ["I can't concentrate today.", 'cognitive_fog'],
    ['My thoughts feel foggy.', 'cognitive_fog'],
  ])('%s supplies direct %s evidence', (answer, emotion) => {
    expect(findExplicitEmotionEvidence(answer)).toMatchObject({
      explicitEmotionDetected: true,
      explicitEmotion: emotion,
    });
  });

  test.each([
    ["I'm not angry.", 'anger'],
    ["I don't feel mad anymore.", 'anger'],
    ["I don't feel sad.", 'sadness'],
    ["I'm not sad.", 'sadness'],
    ["I'm not feeling lonely today.", 'loneliness'],
    ["I wasn't lonely today.", 'loneliness'],
    ["I'm not worried.", 'anxiety'],
    ['I am no longer worried.', 'anxiety'],
    ["I'm not happy today.", 'happiness'],
  ])('%s records negation without affirmative evidence', (answer, emotion) => {
    const result = findExplicitEmotionEvidence(answer);
    expect(result.explicitEmotionDetected).toBe(false);
    expect(result.negatedEmotions).toContain(emotion);
  });

  test.each([
    'My son is angry.',
    'My daughter is angry.',
    'I met an angry person.',
    'The movie made the character angry.',
    'My friend is sad.',
    'My neighbour lives alone.',
  ])('%s does not infer the speaker emotion', (answer) => {
    expect(findExplicitEmotionEvidence(answer).explicitEmotionDetected).toBe(false);
  });

  test('the latest current clause is primary and earlier evidence is retained', () => {
    expect(findExplicitEmotionEvidence('I was sad earlier, but now I am angry.')).toMatchObject({
      explicitEmotion: 'anger', secondaryEmotions: ['sadness'],
    });
  });

  test('mixed first-person clauses preserve primary and secondary evidence', () => {
    expect(findExplicitEmotionEvidence("I'm angry, but I also feel a little sad.")).toMatchObject({
      explicitEmotion: 'sadness', secondaryEmotions: ['anger'],
    });
  });
});
