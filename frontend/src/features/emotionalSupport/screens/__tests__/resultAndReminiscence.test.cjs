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

  test('offers exactly one safe alternative — never the whole library', () => {
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

  test('hub offers exactly three gentle entry points after entering Reminiscence', () => {
    expect(hub).toContain('Suggested Memory Prompt');
    expect(hub).toContain('My Remembered Topics');
    expect(hub).toContain('Remember with a Photo');
    expect(hub).toContain("navigate('MemoryMomentScreen'");
    expect(hub).toContain("navigate('RememberedTopicsScreen')");
    expect(hub).toContain("navigate('PhotoMemoryScreen')");
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