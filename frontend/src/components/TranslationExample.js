import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';

/**
 * Example of a component that uses translations
 * This demonstrates how to use the translation hook in any component
 */
const TranslationExample = () => {
  const { t, i18n } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('app.name')}</Text>
      <Text style={styles.message}>Current Language: {i18n.language.toUpperCase()}</Text>
      
      <View style={styles.exampleBox}>
        <Text style={styles.exampleTitle}>{t('common.save')}</Text>
        <Text style={styles.exampleTitle}>{t('common.cancel')}</Text>
        <Text style={styles.exampleTitle}>{t('common.delete')}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  message: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  exampleBox: {
    marginTop: 16,
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
  },
  exampleTitle: {
    fontSize: 14,
    color: '#333',
    marginVertical: 4,
  },
});

export default TranslationExample;
