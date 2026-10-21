import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

let SpeechRecognitionModule = null;
let ExpoEventEmitter = null;
let SpeechModule = null;
try { SpeechRecognitionModule = require('expo-speech-recognition'); } catch (_) { SpeechRecognitionModule = null; }
try { ExpoEventEmitter = require('expo-modules-core').EventEmitter; } catch (_) { ExpoEventEmitter = null; }
try { SpeechModule = require('expo-speech'); } catch (_) { SpeechModule = null; }

export function VoiceInputButton({ onTranscript, disabled = false, style, label = 'Talk' }) {
  const [listening, setListening] = useState(false);
  const transcriptRef = useRef('');
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  useEffect(() => {
    const native = SpeechRecognitionModule?.ExpoSpeechRecognitionModule;
    if (!native || !ExpoEventEmitter) return undefined;
    const emitter = new ExpoEventEmitter(native);
    const start = emitter.addListener('start', () => setListening(true));
    const end = emitter.addListener('end', () => {
      setListening(false);
      const text = transcriptRef.current.trim();
      transcriptRef.current = '';
      if (text) callbackRef.current?.(text);
    });
    const error = emitter.addListener('error', (event) => {
      setListening(false);
      transcriptRef.current = '';
      Alert.alert('Voice input unavailable', event?.message || 'Please try typing your message.');
    });
    const result = emitter.addListener('result', (event) => {
      const text = event?.results?.[0]?.transcript || '';
      if (text) transcriptRef.current = text;
      if (event?.isFinal && text) callbackRef.current?.(text);
    });
    return () => [start, end, error, result].forEach((subscription) => subscription?.remove?.());
  }, []);

  const toggle = async () => {
    const native = SpeechRecognitionModule?.ExpoSpeechRecognitionModule;
    if (!native || !ExpoEventEmitter) {
      Alert.alert('Voice not available', 'Rebuild the development app with speech recognition enabled.');
      return;
    }
    if (listening) { native.stop?.(); setListening(false); return; }
    try {
      const permission = await native.requestPermissionsAsync();
      if (!permission?.granted && permission?.status !== 'granted') {
        Alert.alert('Microphone permission needed', 'Please allow microphone access to use voice input.');
        return;
      }
      transcriptRef.current = '';
      native.start({ lang: 'en-US', interimResults: true, maxAlternatives: 1, continuous: false });
    } catch (_) {
      Alert.alert('Voice input unavailable', 'Please try typing your message.');
    }
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={listening ? 'Stop voice input' : `Voice input: ${label}`} disabled={disabled} onPress={toggle} style={[style, disabled && { opacity: 0.5 }]}>
      <Text>{listening ? '■' : '🎙️'}</Text>
      <Text>{listening ? 'Stop' : label}</Text>
    </Pressable>
  );
}

export function SpeakButton({ text, style }) {
  const [speaking, setSpeaking] = useState(false);
  if (!SpeechModule) return null;
  const onPress = () => {
    if (speaking) { SpeechModule.stop?.(); setSpeaking(false); return; }
    setSpeaking(true);
    SpeechModule.speak(String(text || ''), { language: 'en', rate: 0.9, pitch: 1, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) });
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={speaking ? 'Stop reading' : 'Listen to response'} onPress={onPress} style={style}><Text>{speaking ? '■ Stop' : '🔊 Listen'}</Text></Pressable>;
}
