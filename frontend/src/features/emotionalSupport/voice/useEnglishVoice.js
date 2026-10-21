import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ENGLISH_VOICE_LOCALE,
  friendlySpeechError,
  normalizeVoiceText,
} from './voiceUtils';

let SpeechModule = null;
let SpeechRecognitionModule = null;
let ExpoEventEmitter = null;

try {
  SpeechModule = require('expo-speech');
} catch {
  SpeechModule = null;
}

try {
  SpeechRecognitionModule = require('expo-speech-recognition')?.ExpoSpeechRecognitionModule || null;
} catch {
  SpeechRecognitionModule = null;
}

try {
  ExpoEventEmitter = require('expo-modules-core')?.EventEmitter || null;
} catch {
  ExpoEventEmitter = null;
}

const RECOGNITION_TIMEOUT_MS = 15000;
const PROCESSING_TIMEOUT_MS = 2500;
const ANDROID_RECOGNIZER_RESET_MS = 300;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function extractTranscript(event) {
  const firstResult = event?.results?.[0];
  if (typeof firstResult === 'string') {
    return normalizeVoiceText(firstResult);
  }
  if (typeof firstResult?.transcript === 'string') {
    return normalizeVoiceText(firstResult.transcript);
  }
  if (Array.isArray(firstResult) && typeof firstResult[0]?.transcript === 'string') {
    return normalizeVoiceText(firstResult[0].transcript);
  }
  if (typeof event?.transcript === 'string') {
    return normalizeVoiceText(event.transcript);
  }
  return '';
}

function isFinalResult(event) {
  return Boolean(
    event?.isFinal ||
    event?.results?.isFinal ||
    event?.final
  );
}

export default function useEnglishVoice({ onTranscript } = {}) {
  const [audioState, setAudioState] = useState('idle');
  const [voiceError, setVoiceError] = useState('');
  const transcriptRef = useRef('');
  const recognitionSessionActiveRef = useRef(false);
  const recognitionTimerRef = useRef(null);
  const processingTimerRef = useRef(null);
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const recognition = SpeechRecognitionModule;
  const speech = SpeechModule;
  const recognitionAvailable = Boolean(recognition);
  const speechAvailable = Boolean(speech);

  const clearRecognitionTimers = useCallback(() => {
    if (recognitionTimerRef.current) clearTimeout(recognitionTimerRef.current);
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    recognitionTimerRef.current = null;
    processingTimerRef.current = null;
  }, []);

  const stopSpeaking = useCallback(() => {
    try { speech?.stop?.(); } catch { /* device engine already stopped */ }
    setAudioState((current) => (current === 'speaking' ? 'idle' : current));
  }, [speech]);

  const stopListening = useCallback((abort = false) => {
    clearRecognitionTimers();
    try {
      if (abort) recognition?.abort?.();
      else recognition?.stop?.();
    } catch { /* recognizer already stopped */ }
    recognitionSessionActiveRef.current = false;
    setAudioState((current) => (
      current === 'listening' || current === 'processing' ? 'idle' : current
    ));
  }, [clearRecognitionTimers, recognition]);

  const stopAll = useCallback(() => {
    clearRecognitionTimers();
    try { speech?.stop?.(); } catch { /* no-op */ }
    try { recognition?.abort?.(); } catch { /* no-op */ }
    recognitionSessionActiveRef.current = false;
    setAudioState('idle');
  }, [clearRecognitionTimers, recognition, speech]);

  useEffect(() => {
    if (!recognition || !ExpoEventEmitter) {
      return undefined;
    }
    const eventEmitter = new ExpoEventEmitter(recognition);
    const subscriptions = [
      eventEmitter.addListener('start', () => setAudioState('listening')),
      eventEmitter.addListener('result', (event) => {
        const transcript = extractTranscript(event);
        if (!transcript) return;
        transcriptRef.current = transcript;
        callbackRef.current?.(transcript, isFinalResult(event));
        if (isFinalResult(event)) {
          recognitionSessionActiveRef.current = false;
          if (recognitionTimerRef.current) clearTimeout(recognitionTimerRef.current);
          recognitionTimerRef.current = null;
          setAudioState('processing');
          // The transcript is already captured; fully release Android's recognizer
          // so the next adaptive turn does not fail with recognizer-busy.
          try { recognition?.abort?.(); } catch { /* recognizer already ended */ }
          processingTimerRef.current = setTimeout(() => {
            setAudioState('idle');
            processingTimerRef.current = null;
          }, PROCESSING_TIMEOUT_MS);
        }
      }),
      eventEmitter.addListener('end', () => {
        const wasUserRecognitionSession = recognitionSessionActiveRef.current;
        recognitionSessionActiveRef.current = false;
        clearRecognitionTimers();
        if (wasUserRecognitionSession && !transcriptRef.current) {
          setVoiceError("I couldn't hear an answer. Please try again or type your response.");
        }
        setAudioState('idle');
      }),
      eventEmitter.addListener('error', (event) => {
        if (String(event?.error || event?.code || '').toLowerCase() === 'aborted') return;
        recognitionSessionActiveRef.current = false;
        clearRecognitionTimers();
        setVoiceError(friendlySpeechError(event));
        setAudioState('idle');
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription?.remove?.());
  }, [clearRecognitionTimers, recognition]);

  useEffect(() => stopAll, [stopAll]);

  const startListening = useCallback(async () => {
    setVoiceError('');
    transcriptRef.current = '';
    // Critical ordering: device TTS is stopped before microphone activation.
    try { await speech?.stop?.(); } catch { /* no-op */ }
    if (!recognition) {
      setVoiceError('Voice recognition is unavailable in this app build. You can continue by typing.');
      return false;
    }
    try {
      if (Platform.OS === 'web' && recognition.isRecognitionAvailable && !recognition.isRecognitionAvailable()) {
        setVoiceError('Voice recognition is unavailable in this browser. You can continue by typing.');
        return false;
      }
      const permission = await recognition.requestPermissionsAsync();
      if (!permission?.granted && permission?.status !== 'granted') {
        setVoiceError('Microphone access is unavailable. You can continue by typing your answer.');
        return false;
      }
      // Clear any native session left by the previous adaptive turn. Android may
      // otherwise accept start() and then emit a busy/client error asynchronously.
      try { recognition.abort?.(); } catch { /* no active session */ }
      if (Platform.OS === 'android') await wait(ANDROID_RECOGNIZER_RESET_MS);
      // Show Listening immediately; some Android recognizers do not emit a start event.
      recognitionSessionActiveRef.current = true;
      setAudioState('listening');
      await recognition.start({
        lang: ENGLISH_VOICE_LOCALE,
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
      });
      recognitionTimerRef.current = setTimeout(() => {
        try { recognition.stop?.(); } catch { /* no-op */ }
        setVoiceError("I couldn't hear an answer. Please try again or type your response.");
        setAudioState('idle');
        recognitionTimerRef.current = null;
      }, RECOGNITION_TIMEOUT_MS);
      return true;
    } catch (error) {
      recognitionSessionActiveRef.current = false;
      setVoiceError(friendlySpeechError(error));
      setAudioState('idle');
      return false;
    }
  }, [recognition, speech]);

  const speak = useCallback(async (text) => {
    const utterance = normalizeVoiceText(text);
    if (!utterance || !speech) {
      if (!speech) setVoiceError('Spoken playback is unavailable on this device. The text remains available on screen.');
      return false;
    }
    try {
      stopListening(true);
      await speech.stop?.();
      setAudioState('speaking');
      speech.speak(utterance, {
        language: ENGLISH_VOICE_LOCALE,
        rate: 0.88,
        pitch: 1,
        onDone: () => setAudioState('idle'),
        onStopped: () => setAudioState('idle'),
        onError: () => {
          setVoiceError('Spoken playback is temporarily unavailable. Please read the text on screen.');
          setAudioState('idle');
        },
      });
      return true;
    } catch {
      setVoiceError('Spoken playback is temporarily unavailable. Please read the text on screen.');
      setAudioState('idle');
      return false;
    }
  }, [speech, stopListening]);

  return {
    audioState,
    isListening: audioState === 'listening' || audioState === 'processing',
    isSpeaking: audioState === 'speaking',
    recognitionAvailable,
    speechAvailable,
    voiceError,
    clearVoiceError: () => setVoiceError(''),
    speak,
    startListening,
    stopAll,
    stopListening,
    stopSpeaking,
  };
}
