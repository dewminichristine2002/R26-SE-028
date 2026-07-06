import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function StatusMessage({ loading, error, empty, emptyText }) {
  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#1E5A7E" />
        <Text style={styles.text}>Loading support summary...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={[styles.text, styles.errorText]}>{error}</Text>
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.card}>
        <Text style={styles.text}>{emptyText || 'No data available yet.'}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#C7E8F7',
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  errorCard: {
    alignItems: 'flex-start',
    backgroundColor: '#FDECEC',
    borderColor: '#F3A6A6',
  },
  text: {
    color: '#557282',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  errorText: {
    color: '#991B1B',
  },
});
