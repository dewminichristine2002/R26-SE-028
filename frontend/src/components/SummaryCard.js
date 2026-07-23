import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
    border: '#2f6654',
    badge: '#e3f8ee',
    badgeText: '#2f6654',
    label: 'Update',
    icon: '\u{1F4AC}',
    cardBg: '#fffdf8',
  },
};

const SummaryCard = ({ card }) => {
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

    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginBottom: 16,
    borderLeftWidth: 6,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#eadfcd',
    borderRightColor: '#eadfcd',
    borderBottomColor: '#eadfcd',
    shadowColor: '#7a674f',
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
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
    color: '#18352f',
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
    color: '#27231f',
    marginTop: 4,
    lineHeight: 31,
  },
  detail: {
    fontSize: 18,
    color: '#5e5143',
    marginTop: 8,
    lineHeight: 27,
  },
});

export default SummaryCard;
