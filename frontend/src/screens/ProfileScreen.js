import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';

const ProfileScreen = () => {
  const { t } = useTranslation();

  // Sample user data
  const userData = {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1-555-0123',
    dateOfBirth: '1950-01-15',
    bloodType: 'O+',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('profile.title')}</Text>
      
      <View style={styles.profileSection}>
        <View style={styles.infoItem}>
          <Text style={styles.label}>{t('profile.name')}:</Text>
          <Text style={styles.value}>{userData.name}</Text>
        </View>
        
        <View style={styles.infoItem}>
          <Text style={styles.label}>{t('profile.email')}:</Text>
          <Text style={styles.value}>{userData.email}</Text>
        </View>
        
        <View style={styles.infoItem}>
          <Text style={styles.label}>{t('profile.phone')}:</Text>
          <Text style={styles.value}>{userData.phone}</Text>
        </View>
        
        <View style={styles.infoItem}>
          <Text style={styles.label}>{t('profile.dateOfBirth')}:</Text>
          <Text style={styles.value}>{userData.dateOfBirth}</Text>
        </View>
        
        <View style={styles.infoItem}>
          <Text style={styles.label}>{t('profile.bloodType')}:</Text>
          <Text style={styles.value}>{userData.bloodType}</Text>
        </View>
      </View>
    </View>
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
    marginBottom: 20,
    color: '#333',
  },
  profileSection: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});

export default ProfileScreen;
