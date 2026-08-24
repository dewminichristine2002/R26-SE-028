const Module = require('module');
const path = require('path');
const { transformFileSync } = require('@babel/core');

function loadSourceModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath);
  const compiled = transformFileSync(filename, { presets: ['babel-preset-expo'] }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const {
  ENGLISH_VOICE_LOCALE,
  friendlySpeechError,
  mapTranscriptToVisibleOption,
  normalizeVoiceText,
} = loadSourceModule('../voiceUtils.js');

describe('English voice utilities', () => {
  test('uses the existing project English locale', () => {
    expect(ENGLISH_VOICE_LOCALE).toBe('en-US');
  });

  test('performs only minimal whitespace normalization', () => {
    expect(normalizeVoiceText('  Apple   Pie  ')).toBe('Apple Pie');
  });

  test('maps only exact normalized visible choices', () => {
    const options = ['Apple', 'Orange juice'];
    expect(mapTranscriptToVisibleOption('  orange JUICE ', options)).toBe('Orange juice');
    expect(mapTranscriptToVisibleOption('orange', options)).toBeNull();
  });

  test('maps a spoken label to its canonical visible option object', () => {
    const options = [{ id: 'apple', label: 'Apple' }, { id: 'chair', label: 'Chair' }];
    expect(mapTranscriptToVisibleOption(' apple ', options)).toEqual(options[0]);
    expect(mapTranscriptToVisibleOption('I think apple', options)).toBeNull();
  });

  test.each([
    [{ error: 'not-allowed' }, 'Microphone access is unavailable'],
    [{ error: 'no-speech' }, "couldn't hear"],
    [{ error: 'network' }, 'temporarily unavailable'],
    [{ error: 'recognizer-busy' }, 'still resetting'],
  ])('returns safe nontechnical recognition errors', (event, expected) => {
    expect(friendlySpeechError(event)).toContain(expected);
  });
});

describe('voice integration safety policy', () => {
  const hookSource = require('fs').readFileSync(path.resolve(__dirname, '../useEnglishVoice.js'), 'utf8');
  const chatSource = require('fs').readFileSync(path.resolve(__dirname, '../../screens/AdaptiveSupportChatScreen.js'), 'utf8');
  const cognitiveSource = require('fs').readFileSync(path.resolve(__dirname, '../../screens/CognitiveActivityScreen.js'), 'utf8');

  test('stops TTS before requesting permission and starting STT', () => {
    const startBlock = hookSource.slice(hookSource.indexOf('const startListening'));
    expect(startBlock.indexOf('await speech?.stop?.()')).toBeGreaterThanOrEqual(0);
    expect(startBlock.indexOf('await speech?.stop?.()')).toBeLessThan(startBlock.indexOf('requestPermissionsAsync'));
    expect(startBlock.indexOf('requestPermissionsAsync')).toBeLessThan(startBlock.indexOf('recognition.start'));
  });

  test('enters listening without waiting for a native start event and has a timeout', () => {
    const startBlock = hookSource.slice(hookSource.indexOf('const startListening'));
    expect(startBlock.indexOf("setAudioState('listening')")).toBeLessThan(startBlock.indexOf('await recognition.start'));
    expect(hookSource).toContain('const RECOGNITION_TIMEOUT_MS = 15000');
    expect(startBlock).toContain('}, RECOGNITION_TIMEOUT_MS)');
    expect(startBlock).toContain('recognition.stop?.()');
  });

  test('releases and resets the Android recognizer between adaptive turns', () => {
    expect(hookSource).toContain('ANDROID_RECOGNIZER_RESET_MS = 300');
    expect(hookSource).toContain("if (Platform.OS === 'android') await wait(ANDROID_RECOGNIZER_RESET_MS)");
    expect(hookSource).toContain('recognition?.abort?.()');
  });

  test('shows no-speech only after a user-started recognition session', () => {
    expect(hookSource).toContain('const recognitionSessionActiveRef = useRef(false)');
    expect(hookSource).toContain('if (wasUserRecognitionSession && !transcriptRef.current)');
    expect(hookSource).toContain('recognitionSessionActiveRef.current = true');
  });

  test('subscribes through the Expo EventEmitter compatibility API', () => {
    expect(hookSource).toContain('new ExpoEventEmitter(recognition)');
    expect(hookSource).toContain("eventEmitter.addListener('result'");
    expect(hookSource).toContain("eventEmitter.addListener('error'");
  });

  test('voice transcript populates the editable answer without auto-submit', () => {
    const transcriptBlock = chatSource.slice(
      chatSource.indexOf('const handleTranscript'),
      chatSource.indexOf('const voice =')
    );
    expect(transcriptBlock).toContain('setCurrentAnswer(transcript)');
    expect(transcriptBlock).not.toContain('handleSendAnswer');
    expect(chatSource).toContain('value={currentAnswer}');
    expect(chatSource).toContain('onChangeText={setCurrentAnswer}');
  });

  test('submission uses one guarded text path for typed and recognized answers', () => {
    expect(chatSource).toContain('submissionLockRef.current');
    expect(chatSource).toContain('answer_text: answerText');
    expect((chatSource.match(/respondAdaptiveChat\(/g) || [])).toHaveLength(1);
  });

  test('question auto-speech is keyed to a new question', () => {
    expect(chatSource).toContain('spokenQuestionRef.current === questionKey');
    expect(chatSource).toContain('spokenQuestionRef.current = questionKey');
  });

  test('cognitive responses use one backend submission path for voice and touch', () => {
    expect((cognitiveSource.match(/submitAdaptiveActivity\(/g) || [])).toHaveLength(1);
    expect(cognitiveSource).toContain('mapTranscriptToVisibleOption');
    expect(cognitiveSource).toContain('selectedAnswer: selected[0]');
  });

  test('memory study speech is confined to the study component', () => {
    expect(cognitiveSource).toContain('item.studyItems.join');
    expect(cognitiveSource).toContain("voice.speak(item?.prompt)");
    expect(cognitiveSource).not.toContain('correctAnswers');
  });
});
