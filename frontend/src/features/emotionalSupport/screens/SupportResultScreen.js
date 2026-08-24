import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ListenControl, VoiceStatus } from '../components/VoiceControls';
import useEnglishVoice from '../voice/useEnglishVoice';
import { Button, Card, OrganicIcon, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { colors, emotionStyles, screenInsets, spacing, type } from '../theme';

const themeStyles = {
  CALM_PASTEL_BLUE: { background: '#EDF8FF', card: '#FFFFFF', accent: '#226C8C', soft: '#DCEFF8' },
  WARM_AMBER: { background: '#FFF7E8', card: '#FFFFFF', accent: '#9A6418', soft: '#FBE8BE' },
  SOFT_GREEN: { background: '#F0F8F1', card: '#FFFFFF', accent: '#2D744B', soft: '#DDF1E2' },
  DEFAULT: { background: '#F6F7F8', card: '#FFFFFF', accent: '#4B5563', soft: '#E8EAED' },
};

function formatLabel(value = '') {
  return String(value || 'neutral').replace(/_/g, ' ');
}
const messages = {
  happiness: "It's good to hear some positive moments came through today.", sadness: 'Thank you for sharing. A gentle activity may feel supportive today.',
  loneliness: 'Thank you for sharing. A connection-focused activity may feel helpful.', anxiety: "Let's choose something calm and simple.",
  anger: 'A gentle pause may be helpful right now.', cognitive_fog: "Let's choose a simple activity at a comfortable pace.",
  neutral: 'Thanks for checking in. Here is a simple activity for today.',
};

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
  const voice = useEnglishVoice();
  const emotionKey = params.detected_emotional_state || 'neutral';
  const emotionLook = emotionStyles[emotionKey] || emotionStyles.neutral;
  const supportMessage = messages[emotionKey] || messages.neutral;
  const activityLook = recommendedActivity.category === 'reminiscence_engagement' ? { accent: '#9A654C', soft: colors.peach, label: 'MEM' } : recommendedActivity.category === 'calming_support' ? { accent: '#3E7189', soft: colors.sky, label: 'CALM' } : { accent: '#6C5B91', soft: colors.lavender, label: 'PLAY' };
  const safeSpokenSummary = `You have completed your check-in. Here is a recommended activity for you: ${recommendedActivity.title || getActivityLabel(supportDirective.tier_2_module)}.`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}><WellnessBackdrop variant={recommendedActivity.category === 'reminiscence_engagement' ? 'warm' : 'sky'} />
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader navigation={navigation} eyebrow="CHECK-IN COMPLETE" title="Check-In Complete" />
        <Card style={styles.summaryCard}>
          <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>
          <Text style={styles.supportMessage}>{supportMessage}</Text>
          <ListenControl
            isSpeaking={voice.isSpeaking}
            onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(safeSpokenSummary)}
          />
          <VoiceStatus audioState={voice.audioState} error={voice.voiceError} />

          <View style={[styles.detailBox, { backgroundColor: emotionLook.soft }]}><View style={[styles.emotionDot, { backgroundColor: emotionLook.accent }]} /><View><Text style={styles.detailLabel}>TODAY'S EMOTIONAL STATE</Text><Text style={[styles.detailValue, { color: emotionLook.accent }]}>{formatLabel(emotionKey)}</Text></View></View>
        </Card>
        <Text style={styles.recommendedLabel}>Recommended Activity</Text><Card style={[styles.activityCard, { backgroundColor: activityLook.soft }]}><OrganicIcon color={activityLook.accent} soft="#FFFFFF88" label={activityLook.label} />
          <Text style={[styles.activityTitle, { color: colors.accent }]}>{recommendedActivity.title || 'Gentle support activity'}</Text>
          <Text style={styles.activityText}>{recommendedActivity.description || 'Choose a short activity to stay engaged.'}</Text>
          {recommendedActivity.estimated_duration_minutes ? (
            <Text style={styles.durationText}>About {recommendedActivity.estimated_duration_minutes} minutes</Text>
          ) : null}
          <Button label={destination ? 'Start Activity' : 'Activity unavailable'} disabled={!destination} onPress={() => {
            if (destination) navigation.navigate(destination, { recommended_activity: recommendedActivity, activity_context: params.activity_context });
          }} style={styles.startButton} />
        </Card>
        <Button variant="secondary" label="View Wellness Trends" onPress={() => navigation.navigate('EmotionalTrendScreen')} style={styles.secondaryButton} />
        <Text style={styles.disclaimerText}>This check-in supports wellbeing and engagement and is not a medical diagnosis.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  check: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 30, height: 60, justifyContent: 'center', width: 60 }, checkText: { color: colors.primary, fontSize: 30, fontWeight: '900' }, emotionDot: { borderRadius: 10, height: 12, marginRight: spacing.md, width: 12 }, recommendedLabel: { ...type.card, color: colors.text, marginBottom: spacing.md, marginTop: spacing.xxl }, startButton: { marginTop: spacing.xl },
  summaryCard: { borderRadius: 22, padding: 22 },
  title: { fontSize: 34, fontWeight: '900', lineHeight: 42 },
  supportMessage: { color: '#263238', fontSize: 20, fontWeight: '700', lineHeight: 30, marginTop: 14 },
  detailsGrid: { gap: 12, marginTop: 20 },
  detailBox: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 16 },
  detailLabel: { color: '#56616A', fontSize: 14, fontWeight: '900', textTransform: 'uppercase' },
  detailValue: { color: '#111827', fontSize: 22, fontWeight: '900', marginTop: 5, textTransform: 'capitalize' },
  disclaimerText: { color: '#64748B', fontSize: 14, fontWeight: '700', lineHeight: 19, marginTop: 18 },
  activityCard: { borderRadius: 22, padding: 22 },
  activityTitle: { fontSize: 25, fontWeight: '900', marginBottom: 10, marginTop: spacing.lg },
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
