import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const severity = {
  good: { color: '#247453', tint: '#DCF1E4', surface: '#F0F8F3', border: '#D3EBDD', label: 'On track', icon: 'checkmark-circle-outline' },
  warning: { color: '#91601E', tint: '#FBEBCF', surface: '#FFFAF0', border: '#F0DEC0', label: 'Needs attention', icon: 'alert-circle-outline' },
  critical: { color: '#9C4250', tint: '#F8E2E5', surface: '#FFF7F7', border: '#EED8DC', label: 'Important', icon: 'warning-outline' },
  default: { color: '#286F9E', tint: '#DEEEF9', surface: '#F1F8FC', border: '#D3E7F2', label: 'Update', icon: 'information-circle-outline' },
};

export default function SummaryCard({ card, onPress }) {
  if (!card) return null;
  const tone = severity[card.severity] || severity.default;
  const content = (
    <>
      <View style={styles.topRow}>
        <View style={[styles.icon, { backgroundColor: tone.tint }]}>
          <Ionicons name={tone.icon} size={22} color={tone.color} />
        </View>
        <Text style={styles.title} numberOfLines={2}>{card.title}</Text>
        <Text style={[styles.status, { color: tone.color, backgroundColor: tone.tint }]}>{tone.label}</Text>
      </View>
      <Text style={styles.headline}>{card.headline}</Text>
      {card.detail ? <Text style={styles.detail}>{card.detail}</Text> : null}
      {onPress ? <Text style={styles.chatHint}>Tap to ask about this</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ask about ${card.title}`}
        accessibilityHint="Opens a health assistant chat about this summary"
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: tone.surface, borderColor: tone.border, borderLeftColor: tone.color },
          pressed && styles.cardPressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: tone.surface, borderColor: tone.border, borderLeftColor: tone.color }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 19, padding: 17, marginBottom: 12, borderWidth: 1, borderLeftWidth: 4 },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 13 },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  title: { flex: 1, color: '#193D31', fontSize: 16, lineHeight: 21, fontWeight: '800', paddingRight: 6 },
  status: { maxWidth: 106, overflow: 'hidden', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, lineHeight: 16, textAlign: 'center', fontWeight: '900' },
  headline: { color: '#193D31', fontSize: 20, lineHeight: 27, fontWeight: '800' },
  detail: { color: '#53645A', fontSize: 16, lineHeight: 24, marginTop: 5 },
  chatHint: { color: '#287CB4', fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 10 },
});
