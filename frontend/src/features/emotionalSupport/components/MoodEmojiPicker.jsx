import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const options = [
  { label: 'Happy', value: 'happy', icon: '🙂' },
  { label: 'Neutral', value: 'neutral', icon: '😐' },
  { label: 'Sad', value: 'sad', icon: '😔' },
  { label: 'Lonely', value: 'lonely', icon: '🥺' },
  { label: 'Stressed', value: 'stressed', icon: '😣' },
];

export default function MoodEmojiPicker({ value, onChange }) {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange?.(option.value)}
            style={[styles.option, active && styles.optionActive]}
          >
            <Text style={styles.icon}>{option.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  option: {
    minWidth: 92,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5DBE1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  optionActive: {
    borderColor: '#446C5E',
    backgroundColor: '#E7F0EA',
  },
  icon: { fontSize: 24, marginBottom: 6 },
  label: { fontSize: 13, color: '#46525E' },
  labelActive: { color: '#23352D', fontWeight: '600' },
});
