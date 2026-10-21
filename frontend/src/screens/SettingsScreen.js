import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import HeaderAccountActions from '../components/HeaderAccountActions';
import { languageService } from '../services/languageService';

const SettingsScreen = ({ onBack }) => {
  const { t, i18n } = useTranslation();
  const availableLanguages = languageService.getAvailableLanguages();

  const handleLanguageChange = async (languageCode) => {
    await languageService.setLanguage(languageCode);
  };

  const renderLanguageOption = ({ item }) => {
    const isSelected = i18n.language === item.code;
    return (
      <TouchableOpacity
        style={[styles.languageItem, isSelected && styles.selectedLanguage]}
        onPress={() => handleLanguageChange(item.code)}
      >
        <Text style={[styles.languageText, isSelected && styles.selectedLanguageText]}>
          {item.nativeName} ({item.code.toUpperCase()})
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.staticHeaderWrap}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={t('settings.backToProfile')}
          >
            <Text style={styles.headerBackText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('settings.title')}</Text>
          <HeaderAccountActions />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

      {/* Language Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <Text style={styles.sectionDescription}>
          {t('settings.currentLanguage', { language: i18n.language.toUpperCase() })}
        </Text>
        <FlatList
          data={availableLanguages}
          renderItem={renderLanguageOption}
          keyExtractor={(item) => item.code}
          scrollEnabled={false}
          style={styles.languageList}
        />
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingText}>{t('settings.help')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingText}>{t('settings.about')}</Text>
        </TouchableOpacity>
      </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F8F5',
  },
  staticHeaderWrap: {
    backgroundColor: '#F7F8F5',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  headerRow: {
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: '#275C4B',
    borderWidth: 2,
    borderColor: '#E1E7E0',
    paddingHorizontal: 10,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#193D31',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  headerBackButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E1E7E0',
  },
  headerBackText: {
    fontSize: 34,
    lineHeight: 38,
    color: '#275C4B',
    marginTop: -3,
    fontWeight: '900',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 30,
    color: '#ffffff',
    fontWeight: '900',
    paddingHorizontal: 8,
  },
  headerSpacer: {
    width: 50,
    height: 50,
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 32,
    backgroundColor: '#F7F8F5',
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E1E7E0',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#193D31',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
    color: '#193D31',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#53645A',
    fontWeight: '700',
    marginBottom: 12,
  },
  languageList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E7E0',
    overflow: 'hidden',
  },
  languageItem: {
    minHeight: 52,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E7E0',
  },
  selectedLanguage: {
    backgroundColor: '#F7F8F5',
  },
  languageText: {
    fontSize: 16,
    color: '#193D31',
    fontWeight: '700',
  },
  selectedLanguageText: {
    fontWeight: '900',
    color: '#275C4B',
  },
  settingItem: {
    minHeight: 58,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E7E0',
    justifyContent: 'center',
  },
  settingText: {
    fontSize: 16,
    color: '#193D31',
    fontWeight: '800',
  },
});

export default SettingsScreen;
