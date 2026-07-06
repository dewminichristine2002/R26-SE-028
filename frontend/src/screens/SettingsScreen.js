import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { languageService } from '../services/languageService';

const SettingsScreen = ({ onBack, onLogout }) => {
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
          <Text style={styles.headerTitle}>{t('settings.title')}</Text>
          <View style={styles.headerSpacer} />
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

      <View style={styles.section}>
        <TouchableOpacity style={[styles.settingItem, styles.logoutButton]} onPress={onLogout}>
          <Text style={[styles.settingText, styles.logoutText]}>{t('settings.logout')}</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#eaf4ff',
  },
  staticHeaderWrap: {
    backgroundColor: '#eaf4ff',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  headerRow: {
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: '#1f6894',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    paddingHorizontal: 10,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0f4f7a',
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
    borderColor: '#d5eafa',
  },
  headerBackText: {
    fontSize: 34,
    lineHeight: 38,
    color: '#1f6894',
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
    backgroundColor: '#eaf4ff',
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
    borderColor: '#d5eafa',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
    color: '#12354d',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4c6d82',
    fontWeight: '700',
    marginBottom: 12,
  },
  languageList: {
    backgroundColor: '#f9fcff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d5eafa',
    overflow: 'hidden',
  },
  languageItem: {
    minHeight: 52,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d5eafa',
  },
  selectedLanguage: {
    backgroundColor: '#eaf4ff',
  },
  languageText: {
    fontSize: 16,
    color: '#12354d',
    fontWeight: '700',
  },
  selectedLanguageText: {
    fontWeight: '900',
    color: '#1f6894',
  },
  settingItem: {
    minHeight: 58,
    backgroundColor: '#f9fcff',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d5eafa',
    justifyContent: 'center',
  },
  settingText: {
    fontSize: 16,
    color: '#12354d',
    fontWeight: '800',
  },
  logoutButton: {
    backgroundColor: '#fff5f5',
    borderColor: '#f3c7c7',
  },
  logoutText: {
    color: '#d32f2f',
    fontWeight: '900',
  },
});

export default SettingsScreen;
