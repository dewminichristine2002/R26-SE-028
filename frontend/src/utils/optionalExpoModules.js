let imagePickerModule;
let speechModule;

/**
 * Dev clients built before a native dependency was added do not include modules like
 * ExponentImagePicker. Static `import 'expo-image-picker'` crashes at load time;
 * require inside try/catch defers that until first use and lets the app register.
 */
export function getExpoImagePicker() {
  if (imagePickerModule === false) return null;
  if (imagePickerModule) return imagePickerModule;
  try {
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
