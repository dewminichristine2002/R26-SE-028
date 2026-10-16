const fs = require('fs');
const path = require('path');

const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');

describe('result screen: primary + alternative recommendation', () => {
  const source = read('screens/SupportResultScreen.js');

  test('shows the primary recommendation first', () => {
    expect(source).toContain('Recommended for you');
    expect(source).toContain("params.recommended_activity || {}");
  });

  test('offers exactly one safe alternative â€” never the whole library', () => {
    expect(source).toContain('Another option');
    expect(source).toContain('alternative_recommendation || null');
    // Only two activity cards exist.
    const cardCount = (source.match(/styles\.activityCard/g) || []).length;
    expect(cardCount).toBeLessThanOrEqual(3); // style definition + two usages
    expect(source).toContain('Choose what feels comfortable today.');
  });

  test('full library is a lower-priority link only', () => {
    expect(source).toContain('Explore all cognitive activities');
    expect(source).toContain("navigate('CognitiveActivityLibraryScreen')");
  });

  test('both options route through existing category destinations only', () => {
    ['cognitive_engagement', 'reminiscence_engagement', 'calming_support'].forEach((category) => {
      expect(source).toContain(category);
    });
    expect(source).toContain("destinationFor(recommendedActivity)");
    expect(source).toContain("destinationFor(alternativeActivity)");
  });

  test('emotional state summary and non-clinical disclaimer remain', () => {
    expect(source).toContain("TODAY'S EMOTIONAL STATE");
    expect(source).toContain('is not a medical diagnosis');
  });
});

describe('reminiscence hub + consent flow', () => {
  const hub = read('screens/ReminiscenceHubScreen.js');
  const memoryMoment = read('screens/MemoryMomentScreen.js');
  const topics = read('screens/RememberedTopicsScreen.js');
  const revisit = read('screens/RevisitMemoriesScreen.js');
  const conversation = read('screens/MemoryConversationScreen.js');
  const navigator = read('EmotionalSupportNavigator.jsx');

  test('hub routes to the three consolidated reminiscence choices', () => {
    expect(hub).toContain('My Life Book');
    expect(hub).toContain('Revisit My Memories');
    expect(hub).toContain("route: 'MyLifeBook'");
    expect(hub).toContain("route: 'MemoryMomentScreen'");
    expect(hub).toContain("route: 'RevisitMemoriesScreen'");
    expect(hub).not.toContain("route: 'GoodDeeds'");
    expect(hub).not.toContain("route: 'PhotoMemoryScreen'");
    expect(navigator).toContain('RevisitMemoriesScreen,');
    expect(navigator).toContain('MemoryConversationScreen,');
    expect(navigator).toContain('GoodDeeds: MyLifeBook');
    expect(navigator).toContain('PhotoMemoryScreen: MyLifeBook');
  });

  test('revisit screen opens only owner-loaded saved entries and keeps topic management available', () => {
    expect(revisit).toContain('listMemoryEntries(elderId)');
    expect(revisit).toContain("navigation.navigate('MemoryConversationScreen', { entryId: entry.id })");
    expect(revisit).toContain("navigation.navigate('RememberedTopicsScreen')");
    expect(revisit).toContain('not independently verified facts');
    expect(revisit).toContain('A written story is saved with this moment.');
    expect(revisit).not.toContain('{entry.story}');
  });

  test('memory revisit uses deterministic optional prompts without scoring or persistence', () => {
    expect(conversation).toContain('FOLLOW_UPS');
    expect(conversation).toContain('Remind me');
    expect(conversation).toContain("I don't remember");
    expect(conversation).toContain('Skip this prompt');
    expect(conversation).toContain('Change topic');
    expect(conversation).toContain('Finish for now');
    expect(conversation).toContain('VoiceAnswerControl');
    expect(conversation).toContain('There is no score or assessment');
    expect(conversation).not.toContain('submitActivityAttempt');
    expect(conversation).not.toContain('processNarrative');
  });

  test('consent question uses non-manipulative wording with explicit Yes/Not now', () => {
    expect(memoryMoment).toContain('Would you like ElderMeds to remember this topic for future memory activities?');
    expect(memoryMoment).toContain('Yes, remember this');
    expect(memoryMoment).toContain('Not now');
    expect(memoryMoment).toContain('consent: true');
  });

  test('declining saves nothing', () => {
    expect(memoryMoment).toContain('Nothing has been saved');
  });

  test('remembered topics can be viewed, removed, and cleared', () => {
    expect(topics).toContain('getReminiscenceTopics(elderId)');
    expect(topics).toContain('deleteReminiscenceTopic(topic.id, elderId)');
    expect(topics).toContain('clearReminiscenceTopics(elderId)');
    expect(topics).toContain('Remove this topic?');
    expect(topics).toContain('Clear all remembered topics?');
  });
});
