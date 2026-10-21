# Multi-Language Support Documentation

This app is set up with **i18next** for comprehensive multi-language support.

## Current Status
- **Active Language**: English
- **Ready for Future Languages**: Spanish, French (and more can be easily added)

## Project Structure

```
frontend/
└── src/
    ├── i18n/
    │   ├── config.js                 # i18n configuration
    │   ├── useTranslation.js         # Custom translation hook
    │   └── locales/
    │       ├── en.json               # English translations
    │       ├── es.json               # Spanish translations (for future)
    │       └── fr.json               # French translations (for future)
    ├── screens/
    │   ├── HomeScreen.js             # Shows translation usage
    │   ├── ProfileScreen.js          # Shows translation usage
    │   └── SettingsScreen.js         # Language switcher included
    ├── components/
    │   └── TranslationExample.js     # Example component
    └── services/
        └── languageService.js        # Language management service
```

## How to Use Translations

### In Any Component:
```javascript
import { useTranslation } from '../i18n/useTranslation';

const MyComponent = () => {
  const { t, i18n } = useTranslation();
  
  return (
    <View>
      {/* Using translations */}
      <Text>{t('home.title')}</Text>
      <Text>{t('common.save')}</Text>
      
      {/* Current language */}
      <Text>Language: {i18n.language}</Text>
    </View>
  );
};
```

### Change Language at Runtime:
```javascript
import { languageService } from '../services/languageService';

// Change to Spanish
await languageService.setLanguage('es');

// Change to French
await languageService.setLanguage('fr');

// Get current language
const currentLang = languageService.getCurrentLanguage();

// Get available languages
const languages = languageService.getAvailableLanguages();
```

## Adding New Languages

### Step 1: Create Translation File
Create a new file in `src/i18n/locales/` (e.g., `de.json` for German):
```json
{
  "app": {
    "name": "ElderMeds",
    "welcome": "Willkommen bei ElderMeds"
  },
  "navigation": {
    "home": "Startseite",
    "profile": "Profil",
    "settings": "Einstellungen"
  }
  // ... rest of translations
}
```

### Step 2: Update i18n Config
Edit `src/i18n/config.js`:
```javascript
import de from './locales/de.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },  // Add this line
};
```

### Step 3: Update Language Service (Optional)
Edit `src/services/languageService.js` to add the new language to `getAvailableLanguages()`:
```javascript
getAvailableLanguages: () => [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },  // Add this
],
```

## Translation File Structure

Translation keys are organized hierarchically:
- `app.*` - App-level strings
- `navigation.*` - Navigation labels
- `home.*` - Home screen strings
- `profile.*` - Profile screen strings
- `settings.*` - Settings screen strings
- `medications.*` - Medication-related strings
- `common.*` - Common buttons and UI elements (Save, Cancel, etc.)
- `errors.*` - Error messages

## Key Features

✅ **Device Language Detection** - App auto-detects device language on first launch  
✅ **Persistent Language Selection** - User's language choice is saved  
✅ **Easy Key-Based Translation** - Simple `t('key')` syntax  
✅ **Full React Navigation Support** - Works with navigation library  
✅ **Ready for Expansion** - Easy to add more languages  
✅ **Type-Safe** - Can add TypeScript support later if needed  

## Dependencies Added

- `i18next` - Internationalization framework
- `react-i18next` - React bindings for i18next
- `expo-localization` - Device locale detection
- `@react-native-async-storage/async-storage` - Persist language preference

## Notes

- All current UI strings should use translations (check SettingsScreen for language selector)
- New features should always add translation keys to all language files
- Empty translation keys will show the key name (helpful for debugging)
- English is the default fallback language
