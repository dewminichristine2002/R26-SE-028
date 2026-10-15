const { buildConversationTitle } = require('../../../src/services/assistantOrchestrator');

describe('assistant conversation titles', () => {
  test('derives a readable heading from the first user question', () => {
    expect(buildConversationTitle('   Check my diabetes risk?   ')).toBe('Check my diabetes risk?');
    expect(buildConversationTitle('How has my mood been recently?')).toBe('How has my mood been recently?');
  });

  test('caps long first questions without breaking readability', () => {
    const message = 'What medicines are running low for my mother and what should I monitor as a caregiver today?';
    expect(buildConversationTitle(message)).toBe('What medicines are running low for my mother and what should I monitor as a...');
  });
});
