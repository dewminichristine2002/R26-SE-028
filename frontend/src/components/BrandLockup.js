import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BrandLogo from './BrandLogo';

export default function BrandLockup() {
  return (
    <View style={styles.wrap}>
      <View style={styles.logoTile}><BrandLogo variant="full" /></View>
      <Text style={styles.tagline}>Everyday care, made easier.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center', marginBottom: 27 },
  logoTile: { width: 222, height: 166, backgroundColor: '#FFFFFF', borderRadius: 25, borderColor: '#E1E7E0', borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#193D31', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  tagline: { color: '#63736A', fontSize: 15, marginTop: 9 },
});
