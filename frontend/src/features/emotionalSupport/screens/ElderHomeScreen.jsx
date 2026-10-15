import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getWellnessTrends } from '../api/emotionalSupportApi';
import { Card, Greeting, InlineState, MetaChip, OrganicIcon, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { colors, radius, screenInsets, shadows, spacing, type } from '../theme';
import { getPersonalizedGreeting } from '../utils/personalization';

/**
 * "Today for You" home — four simple choices for the elder:
 * TALK (Talk With Me) · PLAY (Play an Activity)
 * REMEMBER (Remember Something Nice) · REVIEW (My Wellness)
 */

function MicrophoneGlyph({ color }) {
  return (
    <View style={s.micWrap}>
      <View style={[s.micCapsule, { borderColor: color }]} />
      <View style={[s.micStem, { backgroundColor: color }]} />
      <View style={[s.micBase, { backgroundColor: color }]} />
    </View>
  );
}

export default function ElderHomeScreen({ navigation }) {
  const { elderId, user } = useEmotionalSupportContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const greeting = useMemo(() => getPersonalizedGreeting(user), [user]);

  // Gentle engagement tracking uses only factual app activity counts.
  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      if (!elderId) throw new Error();
      setData(await getWellnessTrends(elderId, '7d'));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [elderId]);
  useEffect(() => { load(); }, [load]);

  const checkins = data?.emotional?.total_checkins ?? null;
  const activities = data?.activities?.total_completed ?? null;
  const differentActivities = new Set(
    (data?.activities?.recent_activity_log || []).map((item) => String(item.activity_type || item.activity_code || '').replace(/_(easy|medium)$/i, ''))
  ).size;
  const hasWeekSummary = !loading && !error && ((checkins || 0) > 0 || (activities || 0) > 0);

  return (
    <SafeAreaView style={s.safe}><WellnessBackdrop />
      <ScrollView contentContainerStyle={s.container}>
        <Greeting text={greeting} subtitle="What would you like to do today?" />
        <ScreenHeader title="Today for You" subtitle="Choose one small moment for yourself." />

        {/* TALK — primary hero */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Talk With Me"
          onPress={() => navigation.navigate('AdaptiveSupportChatScreen')}
          style={({ pressed }) => [s.hero, pressed && s.pressed]}
        >
          <View style={s.heroGlow} />
          <MicrophoneGlyph color={colors.white} />
          <Text style={s.heroEyebrow}>TALK WITH ME</Text>
          <Text style={s.heroTitle}>A short conversation about your day.</Text>
          <View style={s.featureRow}>
            <MetaChip label="5 short moments" tint="#FFFFFF1F" color={colors.white} />
            <MetaChip label="Voice supported" tint="#FFFFFF1F" color={colors.white} />
            <MetaChip label="About 3 minutes" tint="#FFFFFF1F" color={colors.white} />
          </View>
          <View style={s.heroButton}><Text style={s.heroButtonText}>Start Conversation</Text><Text style={s.heroArrow}>›</Text></View>
        </Pressable>

        {/* PLAY + REMEMBER — secondary cards */}
        <View style={s.secondaryRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play an Activity"
            onPress={() => navigation.navigate('CognitiveActivityLibraryScreen')}
            style={({ pressed }) => [s.secondaryPressable, pressed && s.pressed]}
          >
            <Card style={[s.secondaryCard, s.playCard]}>
              <OrganicIcon color="#6C5B91" soft="#EEE8F8" label="PLAY" />
              <Text style={s.secondaryTitle}>Play an Activity</Text>
              <Text style={s.secondaryText}>Choose a short activity you enjoy.</Text>
              <Text style={s.secondaryLink}>Open activities ›</Text>
            </Card>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remember Something Nice"
            onPress={() => navigation.navigate('ReminiscenceHubScreen')}
            style={({ pressed }) => [s.secondaryPressable, pressed && s.pressed]}
          >
            <Card style={[s.secondaryCard, s.rememberCard]}>
              <OrganicIcon color="#9A654C" soft="#FCE8DC" label="MEM" />
              <Text style={s.secondaryTitle}>Remember Something Nice</Text>
              <Text style={s.secondaryText}>Recall a pleasant memory or use a photo.</Text>
              <Text style={s.secondaryLink}>Open memories ›</Text>
            </Card>
          </Pressable>
        </View>

        {/* Your Week — gentle factual summary (no streaks, no scores) */}
        {hasWeekSummary ? (
          <Card style={s.weekCard}>
            <Text style={s.weekTitle}>Your Week</Text>
            <View style={s.weekRow}>
              <View style={s.weekMetric}><Text style={s.weekValue}>{checkins}</Text><Text style={s.weekLabel}>Check-ins</Text></View>
              <View style={s.weekDivider} />
              <View style={s.weekMetric}><Text style={s.weekValue}>{activities}</Text><Text style={s.weekLabel}>Activities</Text></View>
              {differentActivities > 0 ? (<><View style={s.weekDivider} /><View style={s.weekMetric}><Text style={s.weekValue}>{differentActivities}</Text><Text style={s.weekLabel}>Different ones tried</Text></View></>) : null}
            </View>
            <Text style={s.weekThanks}>Thanks for taking time for yourself.</Text>
          </Card>
        ) : !loading && !error ? (
          <Card style={s.weekCard}>
            <Text style={s.weekTitle}>Your Week</Text>
            <Text style={s.weekEmpty}>Your wellness journey will appear here as you use the app.</Text>
          </Card>
        ) : null}

        {/* REVIEW */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My Wellness"
          onPress={() => navigation.navigate('EmotionalTrendScreen')}
          style={({ pressed }) => pressed && s.pressed}
        >
          <Card style={s.wellnessCard}>
            <OrganicIcon color="#376F86" soft="#DDEFF8" label="UP" />
            <View style={s.wellnessCopy}>
              <Text style={s.secondaryTitle}>My Wellness</Text>
              <Text style={s.secondaryText}>See your recent check-ins and activities.</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Card>
        </Pressable>

        <InlineState loading={loading} error={error} onRetry={load} empty={!loading && !error && false} emptyTitle="" emptyText="" />
        <Text style={s.disclaimer}>This feature supports wellbeing and engagement and is not a medical diagnosis.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  hero: { ...shadows.level3, backgroundColor: colors.primary, borderRadius: radius.hero, marginBottom: spacing.xxl, overflow: 'hidden', padding: spacing.xxl },
  heroGlow: { backgroundColor: '#FFFFFF12', borderRadius: 100, height: 180, position: 'absolute', right: -45, top: -65, width: 180 },
  micWrap: { alignItems: 'center', height: 44, justifyContent: 'center', marginTop: spacing.lg, width: 44 },
  micCapsule: { borderRadius: 9, borderWidth: 2.5, height: 22, width: 15 },
  micStem: { height: 7, width: 2.5 },
  micBase: { borderRadius: 2, height: 2.5, width: 18 },
  heroEyebrow: { ...type.meta, color: '#CFEAE4', letterSpacing: 1.2, marginTop: spacing.md },
  heroTitle: { ...type.section, color: colors.white, fontSize: 25, lineHeight: 33, marginTop: spacing.xs },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  heroButton: { alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.button, flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl, minHeight: 58 },
  heroButtonText: { ...type.button, color: colors.primary },
  heroArrow: { color: colors.primary, fontSize: 28, marginLeft: spacing.sm },
  secondaryRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  secondaryPressable: { flex: 1 },
  secondaryCard: { minHeight: 200, padding: spacing.lg },
  playCard: { backgroundColor: '#F4F1FB' },
  rememberCard: { backgroundColor: '#FFF4EC' },
  secondaryTitle: { ...type.card, color: colors.text, fontSize: 18, lineHeight: 24, marginTop: spacing.md },
  secondaryText: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  secondaryLink: { color: colors.primary, fontSize: 14, fontWeight: '900', marginTop: 'auto', paddingTop: spacing.md },
  weekCard: { marginBottom: spacing.lg },
  weekTitle: { ...type.card, color: colors.text },
  weekRow: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.md },
  weekMetric: { alignItems: 'center', flex: 1 },
  weekValue: { ...type.section, color: colors.primary },
  weekLabel: { ...type.meta, color: colors.secondary, marginTop: 2 },
  weekDivider: { backgroundColor: colors.border, height: 44, width: 1 },
  weekThanks: { ...type.meta, color: colors.secondary, marginTop: spacing.md },
  weekEmpty: { ...type.body, color: colors.secondary, marginTop: spacing.sm },
  wellnessCard: { alignItems: 'center', flexDirection: 'row' },
  wellnessCopy: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  chevron: { color: colors.primary, fontSize: 31 },
  disclaimer: { ...type.meta, color: colors.secondary, marginTop: spacing.xl, textAlign: 'center' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.988 }] },
});