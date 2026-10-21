const { buildQuestionBankExport } = require('../../../src/services/questionBankExport');

describe('adaptive question bank export', () => {
  test('exports exact question data and branches with a deterministic content version', () => {
    const rows = [{ question_id: 4, question_code: 'q4', question_text: 'How was your day?',
      phase: 'opening', category: 'check_in', sub_category: null, target_state: 'neutral',
      question_type: 'opening', trigger_keywords: ['day'], response_type: 'free_text',
      quick_replies: [], priority: 1, construct_source: null, is_active: true,
      assessment_dimension: null, is_assessment: false, positive_next_code: 'next_positive' }];
    const exported = buildQuestionBankExport(rows, 'fixed-time');
    expect(exported.questions[0]).toMatchObject({ question_code: 'q4', question_text: 'How was your day?',
      positive_next_code: 'next_positive', is_active: true });
    expect(exported.question_bank_version).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(buildQuestionBankExport(rows, 'later').question_bank_version).toBe(exported.question_bank_version);
  });
});
