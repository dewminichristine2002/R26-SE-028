import React, { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from './src/i18n/config';
import { languageService } from './src/services/languageService';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  useEffect(() => {
    // Load saved language preference on app startup
    languageService.loadSavedLanguage();
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <HomeScreen />
    </I18nextProvider>
  );
}
