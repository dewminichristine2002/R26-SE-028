import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { languageService } from '../services/languageService';

const SettingsScreen = () => {
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
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{t('settings.title')}</Text>

      {/* Language Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <Text style={styles.sectionDescription}>
          {t('common.loading')} {i18n.language.toUpperCase()}
        </Text>
        <FlatList
          data={availableLanguages}
          renderItem={renderLanguageOption}
          keyExtractor={(item) => item.code}
          scrollEnabled={false}
          style={styles.languageList}
        />
      </View>

      {/* Other Settings Sections */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingText}>{t('settings.notifications')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.settingItem}>
          <Text style={styles.settingText}>{t('settings.privacy')}</Text>
        </TouchableOpacity>
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
        <TouchableOpacity style={[styles.settingItem, styles.logoutButton]}>
          <Text style={[styles.settingText, styles.logoutText]}>{t('settings.logout')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  languageList: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  languageItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  selectedLanguage: {
    backgroundColor: '#e8f5e9',
  },
  languageText: {
    fontSize: 16,
    color: '#333',
  },
  selectedLanguageText: {
    fontWeight: '600',
    color: '#4CAF50',
  },
  settingItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  settingText: {
    fontSize: 16,
    color: '#333',
  },
  logoutButton: {
    backgroundColor: '#ffebee',
  },
  logoutText: {
    color: '#d32f2f',
    fontWeight: '600',
  },
});

export default SettingsScreen;
