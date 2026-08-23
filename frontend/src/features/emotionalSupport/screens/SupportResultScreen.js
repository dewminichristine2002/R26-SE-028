import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

const themeStyles = {
  CALM_PASTEL_BLUE: { background: '#EDF8FF', card: '#FFFFFF', accent: '#226C8C', soft: '#DCEFF8' },
  WARM_AMBER: { background: '#FFF7E8', card: '#FFFFFF', accent: '#9A6418', soft: '#FBE8BE' },
  SOFT_GREEN: { background: '#F0F8F1', card: '#FFFFFF', accent: '#2D744B', soft: '#DDF1E2' },
  DEFAULT: { background: '#F6F7F8', card: '#FFFFFF', accent: '#4B5563', soft: '#E8EAED' },
};

function formatLabel(value = '') {
  return String(value || 'neutral').replace(/_/g, ' ');
}

function getActivityLabel(moduleKey) {
  const labels = {
    sensory_breathing_guide: 'Relaxation and breathing support',
    memory_puzzle: 'Memory game',
    relaxing_music: 'Relaxing music',
    conversation_prompt: 'Reminiscence conversation',
    positive_journal: 'Positive memory journal',
    standard_menu: 'Gentle support activity',
  };

  return labels[moduleKey] || 'Gentle support activity';
}

export default function SupportResultScreen({ navigation, route }) {
  const params = route.params || {};
  const supportDirective = params.support_directive || {};
  const recommendedActivity = params.recommended_activity || {};
  const themeKey = supportDirective.tier_3_ui_theme || 'DEFAULT';
  const colors = themeStyles[themeKey] || themeStyles.DEFAULT;
  const destination = {
    cognitive_engagement: 'CognitiveActivityScreen',
    reminiscence_engagement: 'ReminiscenceActivityScreen',
    calming_support: 'CalmingActivityScreen',
  }[recommendedActivity.category];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.accent }]}>Support Result</Text>
          <Text style={styles.supportMessage}>
            {supportDirective.tier_1_audio || 'Thank you for sharing. Choose a gentle activity below.'}
          </Text>

          <View style={styles.detailsGrid}>
            <View style={[styles.detailBox, { backgroundColor: colors.soft }]}>
              <Text style={styles.detailLabel}>Emotional State</Text>
              <Text style={styles.detailValue}>{formatLabel(params.detected_emotional_state)}</Text>
            </View>
            <View style={[styles.detailBox, { backgroundColor: colors.soft }]}>
              <Text style={styles.detailLabel}>Recommended Activity</Text>
              <Text style={styles.detailValue}>{recommendedActivity.title || getActivityLabel(supportDirective.tier_2_module)}</Text>
            </View>
          </View>

          <Text style={styles.disclaimerText}>
            This result is not a medical diagnosis. It is used only to support emotional and cognitive engagement.
          </Text>
        </View>

        <View style={[styles.activityCard, { backgroundColor: colors.soft }]}>
          <Text style={[styles.activityTitle, { color: colors.accent }]}>{recommendedActivity.title || 'Gentle support activity'}</Text>
          <Text style={styles.activityText}>{recommendedActivity.description || 'Choose a short activity to stay engaged.'}</Text>
          {recommendedActivity.estimated_duration_minutes ? (
            <Text style={styles.durationText}>About {recommendedActivity.estimated_duration_minutes} minutes</Text>
          ) : null}
        </View>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => {
            if (destination) navigation.navigate(destination, { recommended_activity: recommendedActivity, activity_context: params.activity_context });
          }}
          disabled={!destination}
        >
          <Text style={styles.primaryButtonText}>{destination ? 'Start Activity' : 'Activity unavailable'}</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('EmotionalTrendScreen')}>
          <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>View Trends</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 40 },
  summaryCard: { borderRadius: 22, padding: 22 },
  title: { fontSize: 34, fontWeight: '900', lineHeight: 42 },
  supportMessage: { color: '#263238', fontSize: 20, fontWeight: '700', lineHeight: 30, marginTop: 14 },
  detailsGrid: { gap: 12, marginTop: 20 },
  detailBox: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16 },
  detailLabel: { color: '#56616A', fontSize: 14, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: '#111827', fontSize: 22, fontWeight: '900', marginTop: 5, textTransform: 'capitalize' },
  disclaimerText: { color: '#64748B', fontSize: 14, fontWeight: '700', lineHeight: 19, marginTop: 18 },
  activityCard: { borderRadius: 22, marginTop: 22, padding: 22 },
  activityTitle: { fontSize: 25, fontWeight: '900', marginBottom: 10 },
  activityText: { color: '#263238', fontSize: 19, fontWeight: '700', lineHeight: 29 },
  durationText: { color: '#56616A', fontSize: 16, fontWeight: '800', marginTop: 12 },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 20,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 72,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 68,
    paddingHorizontal: 18,
  },
  secondaryButtonText: { fontSize: 20, fontWeight: '900' },
});
