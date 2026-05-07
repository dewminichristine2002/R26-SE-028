import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function InsightCard({ title, value, subtitle }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E0D7',
    gap: 6,
  },
  title: {
    fontSize: 13,
    color: '#617066',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: '#203127',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4C5A51',
  },
});
