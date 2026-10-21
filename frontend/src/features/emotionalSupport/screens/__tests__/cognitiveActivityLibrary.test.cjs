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

  test('all eight game families have individual card icons and a full-width play action', () => {
    const source = read('screens/CognitiveActivityLibraryScreen.js');
    const codes = ['word_category', 'odd_one_out', 'word_completion', 'pattern_sequence', 'short_memory_recall', 'orientation_activity', 'simple_math', 'sequence_ordering'];
    for (const code of codes) expect(source).toContain(`${code}:`);
    expect(source).toContain('<ActivityIcon activity={activity} look={look} />');
    expect(source).toContain('accessibilityLabel={`Play ${activity.title}`}');
    expect(source).toContain('s.playButton, { backgroundColor: look.accent }');
    expect(source).not.toContain('numberOfLines={2} style={s.activityDescription}');
  });

  test('cards wrap their content and show pace, available duration, and category metadata', () => {
    const source = read('screens/CognitiveActivityLibraryScreen.js');
    expect(source).toContain('style={s.activityTitle}>{activity.title}</Text>');
    expect(source).toContain('style={s.activityDescription}>{activity.description}</Text>');
    expect(source).toContain('difficultyName(activity.recommended_difficulty');
    expect(source).toContain('Number.isFinite(duration) && duration > 0');
    expect(source).toContain('ACTIVITY_VISUALS[activity.activity_code]?.category');
  });

  test('screen exposes gentle difficulty labels, round flow, and non-clinical summary actions', () => {
    const source = read('screens/CognitiveActivityScreen.js');
    expect(source).toContain("Round {index + 1} of {total}");
    expect(source).toContain('A Little More Challenge');
    expect(source).toContain('Gentle');
    expect(source).toContain('Enter the missing letter');
    expect(source).toContain('Show hint');
    expect(source).toContain('Skip this question');
    expect(source).toContain('Nice work today');
    expect(source).toContain('Play Again');
    expect(source).toContain('Return to Results');
    expect(source).toContain('Return Home');
    expect(source).toContain("navigation.goBack()");
  });
});
