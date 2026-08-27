export const ENGLISH_VOICE_LOCALE = 'en-US';

export function normalizeVoiceText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function mapTranscriptToVisibleOption(transcript, options = []) {
  const normalized = normalizeVoiceText(transcript).toLocaleLowerCase('en-US');
  if (!normalized) return null;
  return options.find((option) => {
    const label = typeof option === 'string' ? option : option?.label;
    return normalizeVoiceText(label).toLocaleLowerCase('en-US') === normalized;
  }) || null;
}

export function friendlySpeechError(event = {}) {
  const code = String(event.error || event.code || '').toLowerCase();
  if (code === 'not-allowed' || code === 'permission-denied') {
    return 'Microphone access is unavailable. You can continue by typing your answer.';
  }
  if (code === 'no-speech' || code === 'speech-timeout' || code === 'timeout') {
    return "I couldn't hear an answer. Please try again or type your response.";
  }
  if (code === 'network' || code === 'service-not-allowed' || code === 'language-not-supported') {
    return 'Voice recognition is temporarily unavailable. You can continue by typing.';
  }
  if (code === 'audio-capture') {
    return 'The microphone is being used elsewhere. You can try again or continue by typing.';
  }
  if (code === 'busy' || code === 'recognizer-busy' || code === 'client') {
    return 'The microphone is still resetting. Please wait a moment and try again, or continue by typing.';
  }
  return 'Voice recognition is temporarily unavailable. You can continue by typing.';
}
