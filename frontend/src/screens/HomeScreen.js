import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';

const HomeScreen = () => {
  const { t } = useTranslation();

  const menuItems = [
    { id: 1, label: 'home.reminder', icon: '🔔' },
    { id: 2, label: 'home.allergies', icon: '⚠️' },
    { id: 3, label: 'home.emotions', icon: '😊' },
    { id: 4, label: 'home.dashboard', icon: '📊' },
  ];

  const handleButtonPress = (itemLabel) => {
    console.log(`Navigating to ${itemLabel}`);
    // TODO: Navigate to the respective screen
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{t('home.title')}</Text>
      <Text style={styles.welcome}>{t('home.welcome')}</Text>

      <View style={styles.grid}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.button}
            onPress={() => handleButtonPress(item.label)}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.buttonLabel}>{t(item.label)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  welcome: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  button: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: {
    fontSize: 40,
    marginBottom: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    textAlign: 'center',
  },
});

export default HomeScreen;
