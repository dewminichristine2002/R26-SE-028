const fs = require('fs');
const path = require('path');

const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');

describe('self-selected cognitive activity navigation contract', () => {
  test('Home opens the registered activity library', () => {
    expect(read('screens/ElderHomeScreen.jsx')).toContain("navigate('CognitiveActivityLibraryScreen')");
    expect(read('EmotionalSupportNavigator.jsx')).toContain('CognitiveActivityLibraryScreen');
  });

  test('library loads server metadata and starts a self-selected activity through the existing screen', () => {
    const source = read('screens/CognitiveActivityLibraryScreen.js');
    expect(source).toContain('getCognitiveActivities(elderId)');
    expect(source).toContain("navigate('CognitiveActivityScreen'");
    expect(source).toContain("activity_source: 'self_selected'");
    expect(source).toContain('activity.description');
    expect(source).toContain('estimated_duration_minutes');
  });

  test('completion can return to the library and trends while recommended flow stays conditional', () => {
    const source = read('screens/CognitiveActivityScreen.js');
    expect(source).toContain("activitySource === 'self_selected'");
    expect(source).toContain('Try Another Activity');
    expect(source).toContain("navigate('EmotionalTrendScreen')");
    expect(source).toContain('navigation.goBack()');
  });
});
