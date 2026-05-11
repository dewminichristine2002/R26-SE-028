import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const AssistantFAB = ({ onPress, label = 'Ask me', visible = true }) => {
  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open your health helper"
        accessibilityHint="Talk to the AI helper about your health"
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <View style={styles.iconBubble}>
          <Text style={styles.icon}>{'\u{1F49A}'}</Text>
        </View>
        <View style={styles.textBox}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.subtitle}>Health Helper</Text>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 16,
    bottom: 20,
    zIndex: 999,
    elevation: 14,
  },
  button: {
    backgroundColor: '#2563EB',
    minHeight: 68,
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 2,
    borderColor: '#1D4ED8',
  },
  buttonPressed: {
    backgroundColor: '#1D4ED8',
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  icon: {
    fontSize: 26,
  },
  textBox: {
    paddingRight: 4,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },
  subtitle: {
    color: '#DBEAFE',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
});

export default AssistantFAB;
