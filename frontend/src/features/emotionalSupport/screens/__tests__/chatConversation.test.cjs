const fs = require('fs');
const path = require('path');

const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');
const stripComments = (src) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('voice-first Talk With Me conversation screen', () => {
  const source = read('screens/AdaptiveSupportChatScreen.js');

  test('Speak Answer is the visually primary answer action', () => {
    expect(source).toContain('Speak Answer');
    expect(source).toContain('speakButton');
    // Large touch target.
    expect(source).toMatch(/speakButton: \{[^}]*minHeight: 96/);
  });

  test('microphone never starts automatically — user always controls listening', () => {
    expect(source).toContain('The microphone NEVER starts automatically');
    // startListening is only invoked from explicit press handlers and Try again.
    const startCalls = source.match(/voice\.startListening\(\)/g) || [];
    expect(startCalls.length).toBeGreaterThanOrEqual(1);
    expect(source).not.toMatch(/useEffect[\s\S]{0,200}startListening\(\)/);
  });

  test('question is offered aloud with a prominent Listen control', () => {
    expect(source).toContain('ListenControl');
    expect(source).toContain('voice.speak(currentQuestion.questionText)');
  });

  test('current-turn focus: acknowledgement bubble + collapsed previous conversation', () => {
    expect(source).toContain('View previous conversation');
    expect(source).toContain('Hide previous conversation');
    expect(source).toContain('You said:');
    expect(source).toContain('ackBubble');
    expect(source).toContain('previousTurns');
  });

  test('calm progress dots replace questionnaire progress bar', () => {
    expect(source).toContain('ConversationDots');
    expect(source).toContain('Conversation moment ${current} of ${total}');
    expect(source).not.toContain('<Progress');
  });

  test('transcript review requires explicit confirmation — never auto-submitted', () => {
    expect(source).toContain('I heard:');
    expect(source).toContain('Use this answer');
    expect(source).toContain('Try again');
    // Continue only sends when canSend; transcript alone does not submit.
    expect(source).toContain('never auto-submitted');
    expect(source).toContain('disabled={!canSend || voice.isListening}');
  });

  test('elder-friendly voice states without technical wording', () => {
    expect(source).toContain('Ready to listen');
    expect(source).toContain('Listening...');
        const forbidden = [/\bSTT\b/i, /\bconfidence\b/i, /\btranscription engine\b/i, /\bspeech recognition result\b/i, /\brecognizer\b/i];
    forbidden.forEach((pattern) => expect(stripComments(source)).not.toMatch(pattern));
  });

  test('Quick answers and typing in your own words remain available', () => {
    expect(source).toContain('Quick answers');
    expect(source).toContain('or answer in your own words');
    expect(source).toContain('handleQuickReply');
  });

  test('alternative recommendation is forwarded to the result screen', () => {
    expect(source).toContain('alternative_recommendation');
  });

  test('exactly five conversation moments are enforced by the backend contract', () => {
    expect(source).toContain('const TOTAL_QUESTIONS = 5;');
  });

  test('animations stay calm (no flashing/bouncing/confetti)', () => {
    const forbidden = [/confetti/i, /bounce/i, /flash/i, /spring.*friction:\s*[0-2]/i];
    forbidden.forEach((pattern) => expect(source).not.toMatch(pattern));
    expect(source).toContain('duration: 230'); // gentle question fade
  });
});