import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

// Import translation files
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import si from './locales/si.json';

// Translation resources
const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  si: { translation: si },
};

// Get device language
const deviceLanguage = Localization.locale.split('-')[0];

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3',
    resources,
    lng: ['es', 'fr', 'si', 'ta'].includes(deviceLanguage) ? deviceLanguage : 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
