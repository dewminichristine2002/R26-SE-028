import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function ActivityCard({ title, type, prompt }) {
  return (
    <View style={styles.card}>
      <Text style={styles.type}>{type}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.prompt}>{prompt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#F2F7EE',
    borderWidth: 1,
    borderColor: '#D3DECB',
    gap: 8,
  },
  type: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B7755',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#223125',
  },
  prompt: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4C5A51',
  },
});
