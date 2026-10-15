const fs = require('fs');
const path = require('path');

const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');

describe('self-selected cognitive activity navigation contract', () => {
  test('Home opens the registered activity library', () => {
    expect(read('screens/ElderHomeScreen.jsx')).toContain("navigate('CognitiveActivityLibraryScreen')");
    expect(read('EmotionalSupportNavigator.jsx')).toContain('CognitiveActivityLibraryScreen');
  });

  test('library loads server metadata and shows a suggested activity card', () => {
    const source = read('screens/CognitiveActivityLibraryScreen.js');
    expect(source).toContain('getCognitiveActivities(elderId)');
    expect(source).toContain("navigate('CognitiveActivityScreen'");
    expect(source).toContain("activity_source: 'self_selected'");
    expect(source).toContain('Suggested for You');
    expect(source).toContain('A little variety for today\'s brain play.');
    expect(source).toContain('estimated_duration_minutes');
  });

  test('screen exposes gentle difficulty labels, round flow, and non-clinical summary actions', () => {
    const source = read('screens/CognitiveActivityScreen.js');
    expect(source).toContain("Round {index + 1} of {total}");
    expect(source).toContain('A Little More Challenge');
    expect(source).toContain('Gentle');
    expect(source).toContain("That's right.");
    expect(source).toContain("Nice try. Let's try another one.");
    expect(source).toContain('Nice work today');
    expect(source).toContain('Try Another');
    expect(source).toContain('Finish');
    expect(source).toContain("navigation.goBack()");
  });
});
