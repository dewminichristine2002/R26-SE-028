const { normalizeQuickReplies } = require('../adaptiveQuestionBankRepository');
const { mapQuestionForResponse } = require('../../controllers/adaptiveChatController');
const migration = require('../../../migrations/1748620000000_component4_quick_replies');

describe('adaptive question quick reply metadata', () => {
  test('curates quick replies for 24 active polarity-friendly questions', () => {
    expect(migration.quickReplyQuestionCount).toBe(24);
  });

  test('normalizes only public reply fields and limits the UI to three', () => {
    expect(normalizeQuickReplies([
      { id: 'reply_1', label: 'Pretty good', value: 'Pretty good', targetState: 'happiness' },
      { label: 'Just okay' },
      { label: 'A little difficult' },
      { label: 'Extra' },
    ])).toEqual([
      { id: 'reply_1', label: 'Pretty good', value: 'Pretty good' },
      { id: 'reply_2', label: 'Just okay', value: 'Just okay' },
      { id: 'reply_3', label: 'A little difficult', value: 'A little difficult' },
    ]);
  });

  test('API question mapping carries replies without selector metadata', () => {
    const mapped = mapQuestionForResponse({
      questionId: 1, questionCode: 'open_day_so_far', questionText: 'How has your day been?',
      responseType: 'free_text', quickReplies: [{ id: 'reply_2', label: 'Just okay', value: 'Just okay' }],
      targetState: 'neutral', priority: 1,
    });
    expect(mapped.quick_replies).toEqual([{ id: 'reply_2', label: 'Just okay', value: 'Just okay' }]);
    expect(mapped).not.toHaveProperty('target_state');
    expect(mapped).not.toHaveProperty('priority');
  });
});
