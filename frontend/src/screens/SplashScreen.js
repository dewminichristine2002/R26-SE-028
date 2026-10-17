import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BrandLockup from '../components/BrandLockup';

const SplashScreen = () => {
  return (
    <View style={styles.container}>
      <BrandLockup />
      <Text style={styles.tagline}>Medicines, health checks, and support in one place.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  tagline: {
    marginTop: 4,
    color: '#63736A',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default SplashScreen;
