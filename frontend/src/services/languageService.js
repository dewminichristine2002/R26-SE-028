import i18n from '../i18n/config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGE_KEY = '@eldermeds_language';

/**
 * Service for managing app language
 */
export const languageService = {
  /**
   * Get currently set language
   */
  getCurrentLanguage: () => i18n.language,

  /**
   * Get available languages
   */
  getAvailableLanguages: () => [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    // Add more languages here in future:
    // { code: 'de', name: 'German', nativeName: 'Deutsch' },
    // { code: 'it', name: 'Italian', nativeName: 'Italiano' },
    // { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  ],

  /**
   * Change app language
   */
  setLanguage: async (languageCode) => {
    try {
      await i18n.changeLanguage(languageCode);
      await AsyncStorage.setItem(LANGUAGE_KEY, languageCode);
      return true;
    } catch (error) {
      console.error('Error setting language:', error);
      return false;
    }
  },

  /**
   * Load saved language preference from storage
   */
  loadSavedLanguage: async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
      if (savedLanguage) {
        await i18n.changeLanguage(savedLanguage);
        return savedLanguage;
      }
    } catch (error) {
      console.error('Error loading saved language:', error);
    }
    return i18n.language;
  },
};

export default languageService;
