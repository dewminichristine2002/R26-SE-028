const {
  buildGenericPrompt,
  buildTopicPrompt,
  deriveMemoryTopic,
  PROMPT_TEMPLATES,
  TOPIC_RULES,
} = require('../../../src/services/reminiscenceMemoryService');

describe('consent-based personalized reminiscence topics', () => {
  test('gardening memory derives a safe garden topic', () => {
    const derived = deriveMemoryTopic('I used to grow roses in my garden.');
    expect(derived).toMatchObject({ topic_type: 'garden', topic_label: 'gardening' });
    expect(derived.safe_detail).toBeTruthy();
    // Only the matched keyword is kept — never the surrounding narrative.
    expect(derived.safe_detail.length).toBeLessThan(20);
  });

  test('music, cooking, pet and family memories map to their own topic types', () => {
    expect(deriveMemoryTopic('We sang a song at the party.').topic_type).toBe('music');
    expect(deriveMemoryTopic('I baked a cake this morning.').topic_type).toBe('cooking');
    expect(deriveMemoryTopic('My dog used to sit with me.').topic_type).toBe('pet');
    expect(deriveMemoryTopic('Time with my grandchildren is precious.').topic_type).toBe('family');
  });

  test('unrecognized memories derive no topic (nothing can be stored)', () => {
    expect(deriveMemoryTopic('It was an ordinary Tuesday.')).toBeNull();
    expect(deriveMemoryTopic('')).toBeNull();
    expect(deriveMemoryTopic(null)).toBeNull();
  });

  test('curated deterministic prompts exist for every supported topic type', () => {
    TOPIC_RULES.forEach((rule) => {
      const prompt = buildTopicPrompt({ topic_type: rule.type, topicLabel: rule.label });
      expect(typeof prompt).toBe('string');
      expect(prompt.endsWith('?')).toBe(true);
      expect(PROMPT_TEMPLATES[rule.type]).toBeDefined();
    });
  });

  test('the gardening template matches the curated example phrasing', () => {
    expect(buildTopicPrompt({ topic_type: 'garden', topicLabel: 'gardening' }))
      .toBe('Would you like to remember a garden or plant you enjoyed caring for?');
    expect(buildTopicPrompt({ topic_type: 'music', topicLabel: 'music' }))
      .toBe('Is there a song or kind of music that brings back a pleasant memory?');
  });

  test('generic fallback prompts exist for users without consented topics', () => {
    const prompt = buildGenericPrompt(0);
    expect(typeof prompt).toBe('string');
    expect(prompt.endsWith('?')).toBe(true);
    // Deterministic per seed.
    expect(buildGenericPrompt(1)).toBe(buildGenericPrompt(1));
  });

  test('prompts never make clinical claims', () => {
    const forbidden = /diagnos|dementia|alzheimer|cognitive test|clinical|medical|therapy/i;
    Object.values(PROMPT_TEMPLATES).forEach((template) => {
      [template.withLabel, template.withoutLabel].forEach((prompt) => {
        expect(prompt).not.toMatch(forbidden);
      });
    });
  });
});