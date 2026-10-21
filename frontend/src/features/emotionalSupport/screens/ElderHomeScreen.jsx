import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HeaderAccountActions from '../../../components/HeaderAccountActions';
import { getWellnessTrends } from '../api/emotionalSupportApi';
import { Card, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { colors, radius, screenInsets, spacing, type } from '../theme';

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

function HomeActionCard({ icon, iconColor, iconBackground, buttonColor, title, description, action, accessibilityLabel, onPress, style }) {
  return (
    <Card style={[s.actionCard, style]}>
      <View style={s.actionHeading}>
        <View style={[s.actionIcon, { backgroundColor: iconBackground }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {icon(iconColor)}
        </View>
        <View style={s.actionCopy}>
          <Text accessibilityRole="header" style={s.actionTitle}>{title}</Text>
          <Text style={s.actionDescription}>{description}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [s.actionButton, { backgroundColor: buttonColor, borderColor: buttonColor }, pressed && s.pressed]}
      >
        <Text style={s.actionButtonText}>{action}</Text>
        <Text style={s.actionArrow} accessibilityElementsHidden>›</Text>
      </Pressable>
    </Card>
  );
}

export default function ElderHomeScreen({ navigation, onExit }) {
  const { elderId } = useEmotionalSupportContext();
  const { width, fontScale } = useWindowDimensions();
  const stackWeekStats = width < 350 || fontScale > 1.25;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
      <View style={s.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Home" onPress={onExit || navigation.goBack} style={({ pressed }) => [s.backButton, pressed && s.pressed]}>
          <Ionicons name="arrow-back" size={25} color="#275C4B" />
        </Pressable>
        <View style={s.topTitleRow}>
          <Ionicons name="leaf-outline" size={23} color="#F8D978" />
          <Text style={s.topTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Wellness</Text>
        </View>
        <HeaderAccountActions />
      </View>
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.pageIntro}><Text accessibilityRole="header" style={s.pageTitle}>Today for You</Text><Text style={s.pageSubtitle}>Choose one small moment for yourself.</Text></View>

        <View style={s.actionCards}>
          <HomeActionCard
            icon={(color) => <MicrophoneGlyph color={color} />}
            iconColor={colors.primary}
            iconBackground="#d3f1e4"
            buttonColor="#2D654F"
            title="Talk With Me"
            description="A short, voice-supported conversation about your day."
            action="Start Conversation"
            accessibilityLabel="Talk With Me. Start Conversation."
            onPress={() => navigation.navigate('AdaptiveSupportChatScreen')}
            style={s.talkCard}
          />
          <HomeActionCard
            icon={(color) => <Text style={[s.actionGlyph, { color }]}>▶</Text>}
            iconColor="#5b3ca4"
            iconBackground="#e8def8"
            buttonColor="#68478B"
            title="Play an Activity"
            description="Choose a short activity you enjoy."
            action="Explore Games"
            accessibilityLabel="Play an Activity. Explore Games."
            onPress={() => navigation.navigate('CognitiveActivityLibraryScreen')}
            style={s.playCard}
          />
          <HomeActionCard
            icon={(color) => <Text style={[s.actionGlyph, s.heartGlyph, { color }]}>♡</Text>}
            iconColor="#985b39"
            iconBackground="#f8e5d8"
            buttonColor="#98566C"
            title="Remember Something Nice"
            description="Recall a pleasant memory or use a photo."
            action="Explore Memories"
            accessibilityLabel="Remember Something Nice. Explore Memories."
            onPress={() => navigation.navigate('ReminiscenceHubScreen')}
            style={s.rememberCard}
          />
        </View>

        {/* Your Week — gentle factual summary (no streaks, no scores) */}
        {hasWeekSummary ? (
          <Card style={s.weekCard}>
            <Text style={s.weekTitle}>Your Week</Text>
            <View style={[s.weekGrid, stackWeekStats && s.weekGridStacked]}>
              <WeekMetric value={checkins} label="Check-ins" />
              <WeekMetric value={activities} label="Activities" />
              {differentActivities > 0 ? <WeekMetric value={differentActivities} label="Different activities tried" wide={!stackWeekStats} /> : null}
            </View>
            <Text style={s.weekThanks}>Thanks for taking time for yourself.</Text>
          </Card>
        ) : !loading && !error ? (
          <Card style={s.weekCard}>
            <Text style={s.weekTitle}>Your Week</Text>
            <Text style={s.weekEmpty}>Your wellness journey will appear here as you use the app.</Text>
          </Card>
        ) : null}

        {loading ? (
          <View accessibilityLiveRegion="polite" style={s.weekStatus}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={s.weekStatusText}>Loading your weekly summary…</Text>
          </View>
        ) : null}
        {error ? (
          <View accessibilityLiveRegion="polite" style={s.weekError}>
            <Text style={s.weekErrorText}>Your weekly summary could not load.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Retry weekly summary" onPress={load} style={({ pressed }) => [s.weekRetry, pressed && s.pressed]}>
              <Text style={s.weekRetryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {/* REVIEW */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My Wellness. View My Wellness."
          onPress={() => navigation.navigate('EmotionalTrendScreen')}
          style={({ pressed }) => pressed && s.pressed}
        >
          <Card style={s.wellnessCard}>
            <View style={s.wellnessHeading}>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.wellnessIcon}>
                <Text style={s.wellnessHeart}>♥</Text>
                <View style={s.wellnessPulse} />
              </View>
              <View style={s.wellnessCopy}>
                <Text style={s.wellnessTitle}>My Wellness</Text>
                <Text style={s.wellnessDescription}>See your recent check-ins and activities.</Text>
              </View>
            </View>
            <View style={s.wellnessButton}>
              <Text style={s.wellnessButtonText}>View My Wellness</Text>
              <Text accessibilityElementsHidden style={s.wellnessArrow}>›</Text>
            </View>
          </Card>
        </Pressable>

        <Text style={s.disclaimer}>This feature supports wellbeing and engagement and is not a medical diagnosis.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function WeekMetric({ value, label, wide }) {
  return (
    <View style={[s.weekMetric, wide && s.weekMetricWide]}>
      <Text style={s.weekValue}>{value}</Text>
      <Text style={s.weekLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#275C4B', borderColor: '#F4CF75', borderWidth: 2, borderRadius: 22, paddingHorizontal: 10, marginHorizontal: spacing.xl, marginTop: screenInsets.top, shadowColor: '#20382F', shadowOpacity: 0.17, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  backButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFFFFF', borderColor: '#FFF4C6', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  topTitle: { color: '#FFFFFF', fontSize: 23, lineHeight: 29, fontWeight: '900', marginLeft: 7, flexShrink: 1 },
  topSpacer: { width: 50 },
  container: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: screenInsets.bottom + spacing.xl },
  pageIntro: { marginBottom: spacing.md }, pageTitle: { ...type.section, color: colors.text }, pageSubtitle: { ...type.body, color: colors.secondary, marginTop: spacing.xs },
  actionCards: { gap: spacing.md, marginBottom: spacing.lg },
  actionCard: { borderRadius: radius.card, borderWidth: 1.5, marginBottom: 0, padding: spacing.lg },
  talkCard: { backgroundColor: colors.mint, borderColor: '#b8e4d2' },
  playCard: { backgroundColor: colors.lavender, borderColor: '#dccff6' },
  rememberCard: { backgroundColor: colors.peach, borderColor: '#f0d9c7' },
  actionHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  actionIcon: { alignItems: 'center', borderColor: colors.border, borderRadius: 17, borderWidth: 1, flexShrink: 0, height: 58, justifyContent: 'center', width: 58 },
  actionGlyph: { fontSize: 27, fontWeight: '800', textAlign: 'center' }, heartGlyph: { fontSize: 35, lineHeight: 40 },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: { ...type.card, color: colors.text, fontSize: 19, lineHeight: 25, flexShrink: 1 },
  actionDescription: { ...type.body, color: colors.secondary, fontSize: 15, lineHeight: 21, marginTop: 3 },
  actionButton: { alignItems: 'center', borderRadius: radius.button, borderWidth: 1.5, flexDirection: 'row', justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, width: '100%' },
  actionButtonText: { ...type.button, color: colors.white, flexShrink: 1, textAlign: 'center' },
  actionArrow: { color: colors.white, fontSize: 25, fontWeight: '800', marginLeft: spacing.sm },
  micWrap: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  micCapsule: { borderColor: colors.white, borderRadius: 9, borderWidth: 2.5, height: 22, width: 15 },
  micStem: { backgroundColor: colors.white, height: 7, width: 2.5 },
  micBase: { backgroundColor: colors.white, borderRadius: 2, height: 2.5, width: 18 },
  weekCard: { marginBottom: spacing.lg },
  weekTitle: { ...type.card, color: colors.text },
  weekGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  weekGridStacked: { flexDirection: 'column' },
  weekMetric: { backgroundColor: '#f4f6f2', borderRadius: radius.button, flexBasis: '46%', flexGrow: 1, minHeight: 86, minWidth: 0, padding: spacing.md },
  weekMetricWide: { flexBasis: '100%' },
  weekValue: { ...type.section, color: colors.primary },
  weekLabel: { ...type.body, color: colors.secondary, marginTop: spacing.xs },
  weekThanks: { ...type.meta, color: colors.secondary, marginTop: spacing.md },
  weekStatus: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  weekStatusText: { ...type.meta, color: colors.secondary },
  weekError: { alignItems: 'center', backgroundColor: colors.errorBg, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginBottom: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  weekErrorText: { ...type.meta, color: colors.text, flex: 1, minWidth: 155 },
  weekRetry: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.sm },
  weekRetryText: { ...type.meta, color: colors.primary, fontWeight: '900' },
  weekEmpty: { ...type.body, color: colors.secondary, marginTop: spacing.sm },
  wellnessCard: { backgroundColor: colors.mint, borderColor: '#c8e6d8', borderRadius: radius.card, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.lg },
  wellnessHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  wellnessIcon: { alignItems: 'center', backgroundColor: '#d2eddf', borderColor: '#b8dac8', borderRadius: radius.button, borderWidth: 1, flexShrink: 0, height: 58, justifyContent: 'center', overflow: 'hidden', width: 58 },
  wellnessHeart: { color: colors.primary, fontSize: 27, lineHeight: 34 },
  wellnessPulse: { backgroundColor: colors.primary, borderRadius: 2, height: 3, marginTop: -5, width: 24 },
  wellnessCopy: { flex: 1, minWidth: 0 },
  wellnessTitle: { ...type.card, color: colors.text, fontSize: 20, lineHeight: 27 },
  wellnessDescription: { ...type.body, color: colors.secondary, marginTop: spacing.xs },
  wellnessButton: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: radius.button, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: spacing.md, minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  wellnessButtonText: { ...type.button, color: colors.white, textAlign: 'center' },
  wellnessArrow: { color: colors.white, fontSize: 25, fontWeight: '800', marginLeft: spacing.sm },
  disclaimer: { ...type.meta, color: colors.secondary, marginTop: spacing.xl, textAlign: 'center' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.988 }] },
});
