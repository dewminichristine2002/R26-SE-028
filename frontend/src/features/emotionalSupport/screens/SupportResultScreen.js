import React, { useMemo } from 'react';
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

function SupportActivity({ moduleKey, colors }) {
  const activityText = {
    sensory_breathing_guide: 'Take a slow breath in, pause gently, then breathe out slowly. Repeat this three times.',
    memory_puzzle: 'Name three familiar things from your old home, school, or workplace.',
    relaxing_music: 'Choose a familiar gentle song and rest with it for a few minutes.',
    conversation_prompt: 'Think of someone kind from that memory. What would you like to tell them today?',
    positive_journal: 'Write or say one good thing from this memory that you want to keep.',
    standard_menu: 'You can choose breathing, music, a memory question, or a short journal note.',
  };

  return (
    <View style={[styles.activityCard, { backgroundColor: colors.soft }]}>
      <Text style={[styles.activityTitle, { color: colors.accent }]}>{getActivityLabel(moduleKey)}</Text>
      <Text style={styles.activityText}>{activityText[moduleKey] || activityText.standard_menu}</Text>
    </View>
  );
}

export default function SupportResultScreen({ navigation, route }) {
  const params = route.params || {};
  const supportDirective = params.support_directive || {};
  const themeKey = supportDirective.tier_3_ui_theme || 'DEFAULT';
  const colors = themeStyles[themeKey] || themeStyles.DEFAULT;
  const confidencePercent = useMemo(
    () => Math.round(Number(params.confidence_score || 0) * 100),
    [params.confidence_score]
  );

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
              <Text style={styles.detailLabel}>Detected Emotion</Text>
              <Text style={styles.detailValue}>{formatLabel(params.detected_emotional_state)}</Text>
            </View>
            <View style={[styles.detailBox, { backgroundColor: colors.soft }]}>
              <Text style={styles.detailLabel}>Confidence</Text>
              <Text style={styles.detailValue}>{confidencePercent}%</Text>
            </View>
            <View style={[styles.detailBox, { backgroundColor: colors.soft }]}>
              <Text style={styles.detailLabel}>Risk Level</Text>
              <Text style={styles.detailValue}>{formatLabel(params.risk_level)}</Text>
            </View>
            <View style={[styles.detailBox, { backgroundColor: colors.soft }]}>
              <Text style={styles.detailLabel}>Cognitive Engagement</Text>
              <Text style={styles.detailValue}>{formatLabel(params.cognitive_engagement_status || 'stable')}</Text>
            </View>
            <View style={[styles.detailBox, { backgroundColor: colors.soft }]}>
              <Text style={styles.detailLabel}>Recommended Activity</Text>
              <Text style={styles.detailValue}>{getActivityLabel(supportDirective.tier_2_module)}</Text>
            </View>
            <View style={[styles.detailBox, { backgroundColor: colors.soft }]}>
              <Text style={styles.detailLabel}>Caregiver Notice</Text>
              <Text style={styles.detailValue}>
                {params.caregiver_notification_required ? 'Shared for support' : 'Not needed today'}
              </Text>
            </View>
          </View>

          <Text style={styles.disclaimerText}>
            This result is not a medical diagnosis. It is used only to support emotional and cognitive engagement.
          </Text>
        </View>

        <SupportActivity moduleKey={supportDirective.tier_2_module} colors={colors} />

        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => navigation.navigate('ReminiscenceActivityScreen')}
        >
          <Text style={styles.primaryButtonText}>Do Memory Activity</Text>
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
