import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function StatusMessage({ error, loading, empty, emptyText = 'No data available yet.' }) {
  if (loading) {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.box, styles.errorBox]}>
        <Text style={[styles.text, styles.errorText]}>{error}</Text>
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>{emptyText}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  box: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9E0D7',
  },
  errorBox: {
    borderColor: '#E0B8B8',
    backgroundColor: '#FFF6F5',
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    color: '#516055',
  },
  errorText: {
    color: '#8D403E',
  },
});
