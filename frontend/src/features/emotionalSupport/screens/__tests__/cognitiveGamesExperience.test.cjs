const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'CognitiveActivityScreen.js'), 'utf8');
const registry = require(path.resolve(__dirname, '../../../../../../backend/src/data/cognitiveActivityBank.js'));

describe('cognitive game presentation', () => {
  test('short memory study and recall expose object illustrations with readable answer cards', () => {
    expect(source).toContain("item?.kind === 'multi_recall'");
    expect(source).toContain('compact={illustrated}');
    expect(source).toContain('answerTextStacked');
    expect(source).toContain('function ItemIllustration');
    expect(source).toContain('function Study');
    expect(source).toContain('MEMORIZE');
    expect(source).toContain('RECALL');
  });

  test('registry includes all eight real game families and each has a distinct prompt treatment', () => {
    expect(Object.keys(registry.BANK).sort()).toEqual([
      'odd_one_out', 'orientation_activity', 'pattern_sequence', 'sequence_ordering',
      'short_memory_recall', 'simple_math', 'word_category', 'word_completion',
    ]);
    [
      'CategoryPrompt', 'OddPrompt', 'WordPrompt', 'PatternSequence',
      'Study', 'Ordering', 'OrientationPrompt', 'MathPrompt',
    ].forEach((component) => expect(source).toContain(`function ${component}`));
    expect(source).toContain('function patternGlyphFor');
  });

  test('sequence ordering uses numbered, illustrated steps and retains reset', () => {
    expect(source).toContain('orderNumberText');
    expect(source).toContain('ItemIllustration label={labelOf(option)}');
    expect(source).toContain('showItemIcon');
    expect(source).toContain('Start order again');
  });

  test('answer cards preserve exact option IDs and expose selected state accessibly', () => {
    expect(source).toContain('selected.includes(idOf(option))');
    expect(source).toContain('accessibilityState={{ selected }}');
    expect(source).toContain('onPress={() => onChoose(option)}');
  });

  test('completion view reports answered, skipped, and correct counts and preserves navigation actions', () => {
    expect(source).toContain('const skipped = Math.min(rounds');
    expect(source).toContain('const completed = Math.max(0, rounds - skipped)');
    expect(source).toContain('{skipped} skipped');
    expect(source).toContain('result?.activity_title || activityTitle');
    expect(source).toContain('Try Another Activity');
    expect(source).toContain('Return Home');
  });

  test('layouts respond to narrow screens and larger system font settings', () => {
    expect(source).toContain('width < 350 || fontScale > 1.25');
    expect(source).toContain('studyGridStacked');
    expect(source).toContain('optionGridStacked');
    expect(source).toContain('patternChoices');
  });

  test('server-owned attempt and final submission flow remain in place', () => {
    expect(source).toContain('startAdaptiveActivity(');
    expect(source).toContain('submitAdaptiveActivity(');
    expect(source).toContain('attempt.attempt_id');
    expect(source).toContain('itemResponses: [...responses, response]');
  });
});
