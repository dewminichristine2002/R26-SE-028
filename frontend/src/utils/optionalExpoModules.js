import { Platform } from 'react-native';

let imagePickerModule;
let speechModule;

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
    speechModule = require('expo-speech');
    return speechModule;
  } catch {
    speechModule = false;
    return null;
  }
}
