import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const severityStyles = {
  good: {
    border: '#10B981',
    badge: '#D1FAE5',
    badgeText: '#065F46',
    label: 'Good news',
    icon: '\u2705',
    cardBg: '#F0FDF4',
  },
  warning: {
    border: '#F59E0B',
    badge: '#FEF3C7',
    badgeText: '#92400E',
    label: 'Heads up',
    icon: '\u26A0\uFE0F',
    cardBg: '#FFFBEB',
  },
  critical: {
    border: '#EF4444',
    badge: '#FEE2E2',
    badgeText: '#991B1B',
    label: 'Important',
    icon: '\u{1F6A8}',
    cardBg: '#FEF2F2',
  },
  default: {
    border: '#3B82F6',
    badge: '#DBEAFE',
    badgeText: '#1E3A8A',
    label: 'Update',
    icon: '\u{1F4AC}',
    cardBg: '#FFFFFF',
  },
};

const SummaryCard = ({ card, onAskAssistant }) => {
  if (!card) {
    return null;
  }
  const palette = severityStyles[card.severity] || severityStyles.default;

  return (
    <View
      style={[
        styles.card,
        { borderLeftColor: palette.border, backgroundColor: palette.cardBg },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.cardIcon}>{palette.icon}</Text>
        <Text style={styles.title} numberOfLines={2}>{card.title}</Text>
      </View>

      <View style={[styles.badge, { backgroundColor: palette.badge }]}>
        <Text style={[styles.badgeText, { color: palette.badgeText }]}>
          {palette.label}
        </Text>
      </View>

      <Text style={styles.headline}>{card.headline}</Text>
      {card.detail ? <Text style={styles.detail}>{card.detail}</Text> : null}

      {card.chatPrompt ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ask assistant: ${card.chatPrompt}`}
          onPress={() => onAskAssistant?.(card.chatPrompt)}
          style={({ pressed }) => [styles.askButton, pressed && styles.askButtonPressed]}
        >
          <Text style={styles.askButtonIcon}>{'\u{1F4AC}'}</Text>
          <Text style={styles.askButtonText}>Ask about this</Text>
          <Text style={styles.askButtonArrow}>{'\u279C'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIcon: { fontSize: 28, marginRight: 12 },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#374151',
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  headline: {
    fontSize: 25,
    fontWeight: '900',
    color: '#111827',
    marginTop: 4,
    lineHeight: 31,
  },
  detail: {
    fontSize: 18,
    color: '#374151',
    marginTop: 8,
    lineHeight: 27,
  },
  askButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    alignSelf: 'flex-start',
    minHeight: 58,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  askButtonPressed: {
    backgroundColor: '#EFF6FF',
  },
  askButtonIcon: { fontSize: 20, marginRight: 8 },
  askButtonText: {
    color: '#1D4ED8',
    fontWeight: '900',
    fontSize: 17,
  },
  askButtonArrow: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: 19,
    marginLeft: 6,
  },
});

export default SummaryCard;
