import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCognitiveActivities } from '../api/emotionalSupportApi';
import { Card, InlineState, OrganicIcon, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { activityStyles, colors, radius, screenInsets, spacing, type } from '../theme';

const formatDifficultyLabel = (value) => {
  const normalized = String(value || 'easy').toLowerCase();
  if (normalized === 'medium') return 'A Little More Challenge';
  return 'Gentle';
};

export default function CognitiveActivityLibraryScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext(); const [activities, setActivities] = useState([]); const [recommendedActivity, setRecommendedActivity] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  const load = useCallback(async () => { try { setLoading(true); setError(false); const result = await getCognitiveActivities(elderId); setActivities(result.activities || []); setRecommendedActivity(result.recommended_activity || null); } catch { setError(true); } finally { setLoading(false); } }, [elderId]);
  useEffect(() => { load(); }, [load]);
  const suggestedActivity = recommendedActivity || activities.find((activity) => activity?.activity_code) || activities[0] || null;
  function openActivity(activity) { navigation.navigate('CognitiveActivityScreen', { recommended_activity: { ...activity, difficulty: activity.recommended_difficulty || 'easy' }, activity_context: { user_id: elderId, activity_source: 'self_selected' }, activity_source: 'self_selected' }); }
  return <SafeAreaView style={s.safe}><WellnessBackdrop variant="sky" /><ScrollView contentContainerStyle={s.container}>
    <ScreenHeader navigation={navigation} eyebrow="EXPLORE & ENGAGE" title="Cognitive Activities" subtitle="Choose a short activity you'd enjoy today. Play at your own pace." />
    {!loading && !error ? <View style={s.count}><Text style={s.countValue}>{activities.length}</Text><Text style={s.countText}> activities available</Text></View> : null}
    <InlineState loading={loading} error={error} onRetry={load} empty={!loading && !error && !activities.length} emptyTitle="No activities are available right now" emptyText="Please check again later." />
    {!loading && !error && suggestedActivity ? <View style={s.suggestedSection}><Text style={s.sectionTitle}>Suggested for You</Text><Card style={[s.suggestedCard, { backgroundColor: colors.mint }]}>
      <View style={s.suggestedHeader}><Text style={s.suggestedName}>{suggestedActivity.title}</Text><Text style={[s.difficultyBadge, { color: colors.primary }]}>{formatDifficultyLabel(suggestedActivity.recommended_difficulty || suggestedActivity.difficulty || 'easy')}</Text></View>
      <Text style={s.suggestedText}>A little variety for today's brain play.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Start ${suggestedActivity.title}`} onPress={() => openActivity(suggestedActivity)} style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryButtonText}>Start</Text></Pressable>
    </Card></View> : null}
    <Text style={s.sectionTitle}>Choose an Activity</Text>
    {activities.map((activity) => { const look = activityStyles[activity.activity_code] || { accent: colors.primary, soft: colors.mint, symbol: 'ACT' }; return <Pressable accessibilityRole="button" accessibilityLabel={`Start ${activity.title}`} key={activity.activity_code} onPress={() => openActivity(activity)} style={({ pressed }) => pressed && s.pressed}><Card style={[s.activityCard, { backgroundColor: look.soft }]}><OrganicIcon color={look.accent} soft="#FFFFFF99" label={look.symbol} /><View style={s.copy}><Text style={s.title}>{activity.title}</Text><Text numberOfLines={2} style={s.description}>{activity.description}</Text><View style={s.metaRow}><Text style={[s.difficulty, { color: look.accent }]}>{formatDifficultyLabel(activity.recommended_difficulty || activity.difficulty || 'easy')}</Text><View style={[s.dot, { backgroundColor: look.accent }]} /><Text style={s.meta}>~{activity.estimated_duration_minutes || 2} min</Text></View></View><View style={[s.arrowCircle, { borderColor: look.accent }]}><Text style={[s.arrow, { color: look.accent }]}>â€º</Text></View></Card></Pressable>; })}
    <Text style={s.footer}>These are engagement activities, not medical assessments.</Text>
  </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { backgroundColor: colors.background, flex: 1 }, container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl }, count: { alignItems: 'baseline', flexDirection: 'row', marginBottom: spacing.lg }, countValue: { ...type.section, color: colors.primary }, countText: { ...type.body, color: colors.secondary }, suggestedSection: { marginBottom: spacing.lg }, sectionTitle: { ...type.section, color: colors.text, marginBottom: spacing.md }, suggestedCard: { borderRadius: radius.hero, padding: spacing.xl }, suggestedHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }, suggestedName: { ...type.card, color: colors.text, flex: 1 }, difficultyBadge: { ...type.meta, fontWeight: '900' }, suggestedText: { ...type.body, color: colors.secondary, marginBottom: spacing.md }, primaryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.button, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }, primaryButtonText: { ...type.body, color: '#FFF', fontWeight: '900' }, activityCard: { alignItems: 'center', borderWidth: 0, flexDirection: 'row', marginBottom: spacing.md }, copy: { flex: 1, marginLeft: spacing.md, minWidth: 0 }, title: { ...type.card, color: colors.text }, description: { ...type.meta, color: colors.secondary, marginTop: spacing.xs }, metaRow: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.sm }, difficulty: { ...type.meta, fontWeight: '900' }, dot: { borderRadius: 3, height: 5, marginHorizontal: spacing.sm, width: 5 }, meta: { ...type.meta, color: colors.secondary }, arrowCircle: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', marginLeft: spacing.sm, width: 36 }, arrow: { fontSize: 27, lineHeight: 29 }, pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] }, footer: { ...type.meta, color: colors.secondary, marginTop: spacing.md, textAlign: 'center' } });
