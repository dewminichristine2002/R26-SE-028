import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

const SplashScreen = () => {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/logo.png')}
        style={styles.logoImage}
        resizeMode="contain"
      />
      <Text style={styles.tagline}>Smart medication care, every day</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef1f4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  logoImage: {
    width: '100%',
    maxWidth: 460,
    height: 210,
    marginBottom: 18,
  },
  tagline: {
    marginTop: 4,
    color: '#637488',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default SplashScreen;
