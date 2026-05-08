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
    bottom: 24,
    zIndex: 999,
    elevation: 14,
  },
  button: {
    backgroundColor: '#2563EB',
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  icon: {
    fontSize: 22,
  },
  textBox: {
    paddingRight: 4,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#DBEAFE',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
    letterSpacing: 0.5,
  },
});

export default AssistantFAB;
