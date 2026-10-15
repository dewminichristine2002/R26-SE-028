const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '../../screens/AdaptiveSupportChatScreen.js'), 'utf8');

describe('Adaptive Check-In quick reply UX', () => {
  test('quick reply, typed text, and voice converge on currentAnswer', () => {
    expect(source).toContain('setCurrentAnswer(reply.value)');
    expect(source).toContain('setCurrentAnswer(transcript)');
    expect(source).toContain('onChangeText={setCurrentAnswer}');
    expect(source).toContain('answer_text: answerText');
    expect((source.match(/respondAdaptiveChat\(/g) || [])).toHaveLength(1);
  });

  test('selecting a reply never auto-submits', () => {
    const handler = source.slice(source.indexOf('function handleQuickReply'), source.indexOf('\n  }', source.indexOf('function handleQuickReply')) + 4);
    expect(handler).toContain('setCurrentAnswer(reply.value)');
    expect(handler).not.toContain('handleSendAnswer');
    expect(handler).not.toContain('respondAdaptiveChat');
  });

  test('selection is replaceable and derived from the editable answer', () => {
    expect(source).toContain('reply.value === currentAnswer');
    expect(source).toContain('accessibilityState={{ selected }}');
    expect(source).toContain('or answer in your own words');
  });
});
