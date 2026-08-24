import { Platform } from 'react-native';

let imagePickerModule;
let speechModule;
let speechRecognitionModule;

/**
 * Dev clients built before expo-image-picker was added have no native ExponentImagePicker.
 * Loading `expo-image-picker` still evaluates `requireNativeModule('ExponentImagePicker')` and throws.
 * Check optional native registration first (same logic as expo-modules-core), then require JS.
 */
export function getExpoImagePicker() {
  if (imagePickerModule === false) return null;
  if (imagePickerModule) return imagePickerModule;
  try {
    if (Platform.OS !== 'web') {
      const { requireOptionalNativeModule } = require('expo-modules-core');
      if (!requireOptionalNativeModule('ExponentImagePicker')) {
        imagePickerModule = false;
        return null;
      }
    }
    imagePickerModule = require('expo-image-picker');
    return imagePickerModule;
  } catch {
    imagePickerModule = false;
    return null;
  }
}

export function getExpoSpeech() {
  if (speechModule === false) return null;
  if (speechModule) return speechModule;
  try {
    if (Platform.OS !== 'web') {
      const { requireOptionalNativeModule } = require('expo-modules-core');
      if (!requireOptionalNativeModule('ExpoSpeech')) {
        speechModule = false;
        return null;
      }
    }
    speechModule = require('expo-speech');
    return speechModule;
  } catch {
    speechModule = false;
    return null;
  }
}

export function getExpoSpeechRecognitionModule() {
  if (speechRecognitionModule === false) return null;
  if (speechRecognitionModule) return speechRecognitionModule;
  try {
    if (Platform.OS !== 'web') {
      const { requireOptionalNativeModule } = require('expo-modules-core');
      if (!requireOptionalNativeModule('ExpoSpeechRecognition')) {
        speechRecognitionModule = false;
        return null;
      }
    }
    const pkg = require('expo-speech-recognition');
    if (!pkg?.ExpoSpeechRecognitionModule) {
      speechRecognitionModule = false;
      return null;
    }
    speechRecognitionModule = pkg.ExpoSpeechRecognitionModule;
    if (pkg.addSpeechRecognitionListener) {
      speechRecognitionModule.addSpeechRecognitionListener =
        pkg.addSpeechRecognitionListener;
    }
    return speechRecognitionModule;
  } catch {
    speechRecognitionModule = false;
    return null;
  }
}
