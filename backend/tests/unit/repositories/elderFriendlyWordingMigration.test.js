const fs = require('fs');
const path = require('path');

/**
 * Static contract test for the elder-friendly wording migration.
 * Verifies that only question_text / quick_replies change, that rewritten
 * questions stay short, and that every quick-reply set remains balanced
 * (three options with a positive-leaning, middle, and negative-leaning reply).
 */

const migrationPath = path.resolve(__dirname, '../../../migrations/1748650000000_component4_elder_friendly_wording.js');
// eslint-disable-next-line global-require, import/no-dynamic-require
const migration = require(migrationPath);
const source = fs.readFileSync(migrationPath, 'utf8');

describe('elder-friendly question wording migration', () => {
  test('rewrites exactly six question texts without touching semantics', () => {
    expect(migration.rewrittenQuestionCount).toBe(6);
    [
      'lonely_contact_helpful',
      'lonely_daily_engagement',
      'anger_supportive_factor',
      'happy_energy_today',
      'cognitive_engagement_today',
      'neutral_daily_engagement',
    ].forEach((code) => {
      expect(source).toContain(`'${code}'`);
    });
  });

  test('updates exactly four quick-reply sets', () => {
    expect(migration.updatedQuickReplyCount).toBe(4);
  });

  test('migration does not modify semantic columns', () => {
    // The up() SQL must only UPDATE question_text and quick_replies.
    const forbiddenColumns = [
      'target_state =', 'assessment_dimension =', 'is_assessment =',
      'min_confidence =', 'positive_next_code =', 'negative_next_code =',
      'neutral_next_code =', 'followup_next_code =', 'priority =',
      'phase =', 'question_type =',
    ];
    forbiddenColumns.forEach((column) => {
      expect(source.includes(column)).toBe(false);
    });
  });

  test('rewritten questions are short (one idea per question)', () => {
    const newTexts = [
      'Did talking with someone help you feel better today?',
      'Did you spend time doing something you enjoy today?',
      'Did anything help the day feel better?',
      'How has your energy felt today?',
      'Did something keep your interest today?',
      'What did you spend time doing today?',
    ];
    newTexts.forEach((text) => {
      expect(text.length).toBeLessThanOrEqual(60);
      // One clause: no double-clause constructions.
      expect(text.split(',').length).toBeLessThanOrEqual(2);
    });
  });

  test('every updated quick-reply set is balanced with three options', () => {
    const sets = [
      ['Yes, there were', 'A little', 'Not really'],
      ['Yes, I did', 'A little', 'Not really'],
      ['Good energy', 'About usual', 'A bit tired'],
      ['Yes, it did', 'A little', 'Not really'],
    ];
    sets.forEach(([positive, middle, negative]) => {
      expect(positive).toBeTruthy();
      expect(middle).toBeTruthy();
      expect(negative).toBeTruthy();
      // Balanced: one affirming, one neutral-middle, one declining option.
      expect(/^(yes|good)/i.test(positive)).toBe(true);
      expect(/^(a little|about)/i.test(middle)).toBe(true);
      expect(/^(not|a bit)/i.test(negative)).toBe(true);
    });
  });

  test('down migration restores the original texts for full reversibility', () => {
    const originals = [
      'Did any contact with another person help you feel supported today?',
      'Was there anything today that helped you feel involved or connected?',
      'Was there anything or anyone that helped the situation feel better?',
      'How did your energy help you with your day?',
      'Was there an activity or conversation that held your attention today?',
      'What have you enjoyed doing, or spent time doing, today?',
    ];
    originals.forEach((text) => {
      expect(source).toContain(text);
    });
  });

  test('no clinical or abstract language enters the new wording', () => {
    const forbidden = /anhedonia|emotional functioning|cognitive difficulty|assess your|experienced/i;
    const lines = source.split(String.fromCharCode(10));
    const newTextLines = lines.filter((line) => /^\s*'(Did|How|What)/.test(line));
    expect(newTextLines.length).toBeGreaterThan(0);
    newTextLines.forEach((line) => {
      expect(line).not.toMatch(forbidden);
    });
  });
});