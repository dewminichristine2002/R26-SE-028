import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCognitiveActivities } from '../api/emotionalSupportApi';
import { WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { radius, screenInsets, shadows, spacing } from '../theme';

const palette = {
  primary: '#2E6654', primaryDark: '#263E34', dark: '#263E34', text: '#263E34', muted: '#56695E',
  background: '#F8F2E9', surface: '#FFFFFF', tint: '#E2EDE4', sage: '#E2EDE4', gold: '#E7C66C', border: '#D9E5DA', white: '#FFFFFF',
};
const LEVELS = ['easy', 'medium', 'hard'];
const ACTIVITY_ACCENTS = {
  word_category: { accent: '#72549B', soft: '#EEE9F5' },
  odd_one_out: { accent: '#3477A5', soft: '#E7F0F6' },
  word_completion: { accent: '#A65D25', soft: '#F7EDE3' },
  pattern_sequence: { accent: '#526BA0', soft: '#E9EDF6' },
  short_memory_recall: { accent: '#A0556C', soft: '#F5E9ED' },
  orientation_activity: { accent: '#287A75', soft: '#E5F1F0' },
  simple_math: { accent: '#876318', soft: '#F3EEDC' },
  sequence_ordering: { accent: '#31785C', soft: '#E6F0E8' },
};
const ACTIVITY_VISUALS = {
  word_category: { symbol: 'Aa', category: 'WORDS' },
  odd_one_out: { symbol: '\u2260', category: 'COMPARISON' },
  word_completion: { symbol: 'A_', category: 'WORDS' },
  pattern_sequence: { symbol: '\u25cb \u25a1 \u25b3', category: 'PATTERNS' },
  short_memory_recall: { symbol: '\u25ce', category: 'MEMORY' },
  orientation_activity: { symbol: '\u25f7', category: 'EVERYDAY' },
  simple_math: { symbol: '+ \u2212', category: 'NUMBERS' },
  sequence_ordering: { symbol: '1 \u00b7 2 \u00b7 3', category: 'ORDERING' },
};
const difficultyName = (value) => ({ easy: 'Easy', medium: 'Medium', hard: 'Hard' }[String(value || 'easy').toLowerCase()] || 'Easy');
const difficultyDescription = (value) => ({ easy: 'A calm place to begin.', medium: 'A little extra to think about.', hard: 'A fuller set of rounds at your pace.' }[value] || 'Choose the pace that feels right.');

export default function CognitiveActivityLibraryScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [activities, setActivities] = useState([]);
  const [recommendedActivity, setRecommendedActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [difficultyActivity, setDifficultyActivity] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(false);
      const result = await getCognitiveActivities(elderId);
      setActivities(result.activities || []); setRecommendedActivity(result.recommended_activity || null);
    } catch { setError(true); } finally { setLoading(false); }
  }, [elderId]);
  useEffect(() => { load(); }, [load]);

  const suggestedActivity = recommendedActivity || activities.find((activity) => activity?.activity_code) || activities[0] || null;
  function launchActivity(activity, difficulty = activity.recommended_difficulty || 'easy') {
    setDifficultyActivity(null);
    navigation.navigate('CognitiveActivityScreen', { recommended_activity: { ...activity, difficulty }, activity_context: { user_id: elderId, activity_source: 'self_selected' }, activity_source: 'self_selected' });
  }
  function openActivity(activity) {
    const levels = Array.isArray(activity.supported_difficulties) ? activity.supported_difficulties.filter((level) => LEVELS.includes(level)) : [];
    if (levels.length < 2) return launchActivity(activity);
    setDifficultyActivity({ activity, levels });
  }

  return <SafeAreaView style={s.safe}>
    <WellnessBackdrop variant="mint" />
    <ScrollView contentContainerStyle={s.container}>
      <View style={s.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={({ pressed }) => [s.back, pressed && s.pressed]}><Text style={s.backText}>{'\u2039'}</Text></Pressable>
        <View style={s.topCopy}><Text style={s.eyebrow}>EXPLORE & ENGAGE</Text><Text accessibilityRole="header" style={s.headerTitle}>Cognitive activities</Text></View>
      </View>
      <Text style={s.subtitle}>Choose a short activity you’d enjoy today. Play at your own pace.</Text>

      {!loading && !error && <View style={s.countPill}><Text style={s.countNumber}>{activities.length}</Text><Text style={s.countLabel}>activities to explore</Text></View>}
      {loading && <LibraryState title="Preparing your activities" message="This will only take a moment." loading />}
      {error && <LibraryState title="Activities couldn’t load" message="Please check your connection and try again." onRetry={load} />}
      {!loading && !error && !activities.length && <LibraryState title="No activities are available" message="Please check again later." />}

      {!loading && !error && suggestedActivity && <View style={s.section}>
        <Text style={s.sectionTitle}>Suggested for You</Text>
        <View style={s.suggestedCard}>
          <View style={s.suggestedTop}><ActivityIcon activity={suggestedActivity} featured /><View style={s.suggestedCopy}><Text style={s.suggestedEyebrow}>A GOOD PLACE TO BEGIN</Text><Text style={s.suggestedName}>{suggestedActivity.title}</Text></View></View>
          <Text style={s.suggestedText}>A little variety for today's brain play. Choose the level that feels comfortable.</Text>
          {!!suggestedActivity.description && <Text style={s.suggestedDescription}>{suggestedActivity.description}</Text>}
          <View style={s.suggestedMeta}><Text style={s.suggestedLevelLabel}>SUGGESTED PACE</Text><Text style={s.recommendedLevel}>{difficultyName(suggestedActivity.recommended_difficulty || suggestedActivity.difficulty || 'easy')}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Start ${suggestedActivity.title}`} onPress={() => openActivity(suggestedActivity)} style={({ pressed }) => [s.startButton, pressed && s.pressed]}><Text style={s.startButtonText}>Choose activity</Text><Text style={s.startArrow}>{'\u203A'}</Text></Pressable>
        </View>
      </View>}

      {!loading && !error && !!activities.length && <View style={s.section}>
        <Text style={s.sectionTitle}>Choose an activity</Text>
        {activities.map((activity) => {
          const look = ACTIVITY_ACCENTS[activity.activity_code] || { accent: palette.primary, soft: palette.sage };
          const duration = Number(activity.estimated_duration_minutes);
          return <View key={activity.activity_code} style={[s.activityCard, { backgroundColor: palette.surface, borderColor: palette.border, borderLeftColor: look.accent }]}>
            <View style={s.activityTop}><ActivityIcon activity={activity} look={look} /><View style={s.activityCopy}><Text style={s.activityTitle}>{activity.title}</Text><Text style={s.activityDescription}>{activity.description}</Text></View></View>
            <View style={s.activityMeta}><View style={[s.activityBadge, { backgroundColor: look.soft }]}><Text style={[s.activityBadgeText, { color: look.accent }]}>{difficultyName(activity.recommended_difficulty || activity.difficulty || 'easy')} pace</Text></View>{Number.isFinite(duration) && duration > 0 && <Text style={s.activityDuration}>About {duration} min</Text>}<Text style={s.activityCategory}>{ACTIVITY_VISUALS[activity.activity_code]?.category || 'ACTIVITY'}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Play ${activity.title}`} onPress={() => openActivity(activity)} style={({ pressed }) => [s.playButton, { backgroundColor: look.accent }, pressed && s.pressed]}><Text style={s.playButtonText}>Play Activity</Text><Text style={s.playButtonArrow}>{'\u203A'}</Text></Pressable>
          </View>;
        })}
      </View>}
      <View style={s.footer}><Text style={s.footerText}>These activities are for engagement, not medical assessment.</Text></View>
    </ScrollView>

    <Modal animationType="fade" onRequestClose={() => setDifficultyActivity(null)} transparent visible={Boolean(difficultyActivity)}>
      <View style={s.modalBackdrop}>
        <View accessibilityViewIsModal style={s.modalCard}>
          <View style={s.modalMark}><Text style={s.modalMarkText}>↗</Text></View>
          <Text accessibilityRole="header" style={s.modalTitle}>Choose your pace</Text>
          <Text style={s.modalSubtitle}>{difficultyActivity?.activity?.title || 'Cognitive activity'} · Pick what feels comfortable today.</Text>
          {difficultyActivity?.levels.map((level) => <Pressable accessibilityRole="button" key={level} onPress={() => launchActivity(difficultyActivity.activity, level)} style={({ pressed }) => [s.levelOption, pressed && s.pressed]}>
            <View style={s.levelOptionCopy}><Text style={s.levelName}>{difficultyName(level)}</Text><Text style={s.levelDescription}>{difficultyDescription(level)}</Text></View>
            {level === (difficultyActivity?.activity?.recommended_difficulty || 'easy') ? <View style={s.recommendedPill}><Text style={s.recommendedPillText}>SUGGESTED</Text></View> : <Text style={s.levelArrow}>{'\u203A'}</Text>}
          </Pressable>)}
          <Pressable accessibilityRole="button" onPress={() => setDifficultyActivity(null)} style={({ pressed }) => [s.cancelButton, pressed && s.pressed]}><Text style={s.cancelText}>Not now</Text></Pressable>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

function ActivityIcon({ activity, look, featured = false }) {
  const visual = ACTIVITY_VISUALS[activity?.activity_code];
  const color = featured ? palette.gold : look?.accent || palette.primary;
  const backgroundColor = featured ? palette.sage : look?.soft || palette.sage;
  return <View accessibilityElementsHidden style={[s.activityIcon, featured && s.featuredActivityIcon, { backgroundColor, borderColor: color }]}><Text allowFontScaling style={[s.activityIconText, { color }, featured && s.featuredActivityIconText]}>{visual?.symbol || 'PLAY'}</Text></View>;
}

function LibraryState({ title, message, loading = false, onRetry }) {
  return <View accessibilityLiveRegion="polite" style={s.stateCard}><View style={s.stateMark}>{loading ? <ActivityIndicator color={palette.primary} /> : <Text style={s.stateMarkText}>i</Text>}</View><View style={s.stateCopy}><Text style={s.stateTitle}>{title}</Text><Text style={s.stateMessage}>{message}</Text>{onRetry && <Pressable accessibilityRole="button" onPress={onRetry} style={s.retryButton}><Text style={s.retryText}>Try again</Text></Pressable>}</View></View>;
}

const s = StyleSheet.create({
  safe: { backgroundColor: palette.background, flex: 1 }, container: { paddingBottom: screenInsets.bottom + spacing.xl, paddingHorizontal: spacing.xl, paddingTop: screenInsets.top },
  topBar: { alignItems: 'center', flexDirection: 'row', gap: spacing.md }, topCopy: { flex: 1, minWidth: 0 }, back: { alignItems: 'center', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: radius.pill, borderWidth: 1, height: 52, justifyContent: 'center', width: 52, ...shadows.level1 }, backText: { color: palette.primaryDark, fontSize: 34, lineHeight: 38 }, eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.05 }, headerTitle: { color: palette.dark, fontSize: 28, fontWeight: '900', lineHeight: 34, marginTop: 3 }, subtitle: { color: palette.muted, fontSize: 17, lineHeight: 25, marginTop: spacing.md },
  countPill: { alignSelf: 'flex-start', backgroundColor: palette.sage, borderColor: palette.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 18, paddingHorizontal: 15, paddingVertical: 10 }, countNumber: { color: palette.primaryDark, fontSize: 15, fontWeight: '900' }, countLabel: { color: palette.text, fontSize: 15, fontWeight: '800' }, section: { marginTop: 26 }, sectionTitle: { color: palette.dark, fontSize: 23, fontWeight: '900', marginBottom: 14 },
  suggestedCard: { backgroundColor: palette.primary, borderColor: palette.gold, borderRadius: radius.hero, borderWidth: 2, padding: 19, ...shadows.level3 }, suggestedTop: { alignItems: 'center', flexDirection: 'row', gap: 13 }, suggestedCopy: { flex: 1, minWidth: 0 }, suggestedEyebrow: { color: palette.sage, fontSize: 11, fontWeight: '900', letterSpacing: 0.9 }, suggestedName: { color: palette.white, fontSize: 21, fontWeight: '900', lineHeight: 27, marginTop: 3 }, suggestedText: { color: palette.white, fontSize: 16, lineHeight: 23, marginTop: 13 }, suggestedDescription: { color: palette.white, fontSize: 16, lineHeight: 23, marginTop: 8 }, suggestedMeta: { borderTopColor: '#FFFFFF66', borderTopWidth: 1, marginTop: 15, paddingTop: 12 }, suggestedLevelLabel: { color: palette.sage, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 }, recommendedLevel: { color: palette.white, fontSize: 18, fontWeight: '900', marginTop: 2 }, startButton: { alignItems: 'center', backgroundColor: palette.sage, borderColor: palette.gold, borderRadius: 15, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: 13, minHeight: 56, paddingHorizontal: 15, width: '100%' }, startButtonText: { color: palette.primaryDark, fontSize: 17, fontWeight: '900' }, startArrow: { color: palette.primaryDark, fontSize: 24, marginLeft: 7 },
  activityCard: { borderRadius: radius.card, borderLeftWidth: 5, borderWidth: 1, gap: 14, marginBottom: spacing.md, padding: 16, ...shadows.level2 }, activityTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 14 }, activityIcon: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 64, justifyContent: 'center', width: 64 }, activityIconText: { fontSize: 20, fontWeight: '900', textAlign: 'center' }, featuredActivityIcon: { borderRadius: 18, height: 62, width: 62 }, featuredActivityIconText: { fontSize: 19 }, activityCopy: { flex: 1, minWidth: 0 }, activityTitle: { color: palette.dark, fontSize: 21, fontWeight: '900', lineHeight: 28, flexShrink: 1 }, activityDescription: { color: palette.muted, fontSize: 16, lineHeight: 23, marginTop: 5 }, activityMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, activityBadge: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 }, activityBadgeText: { fontSize: 14, fontWeight: '900' }, activityDuration: { color: palette.muted, fontSize: 15, fontWeight: '700' }, activityCategory: { color: palette.muted, fontSize: 12, fontWeight: '900', letterSpacing: 0.7 }, playButton: { alignItems: 'center', borderRadius: radius.button, flexDirection: 'row', justifyContent: 'center', minHeight: 56, paddingHorizontal: 16 }, playButtonText: { color: palette.white, fontSize: 18, fontWeight: '900' }, playButtonArrow: { color: palette.white, fontSize: 25, marginLeft: 8 },
  footer: { alignItems: 'center', marginTop: 9, padding: 10 }, footerText: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }, stateCard: { alignItems: 'flex-start', backgroundColor: palette.surface, borderColor: palette.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 18, padding: 15 }, stateMark: { alignItems: 'center', backgroundColor: palette.tint, borderRadius: 13, height: 38, justifyContent: 'center', width: 38 }, stateMarkText: { color: palette.primaryDark, fontSize: 18, fontWeight: '900' }, stateCopy: { flex: 1 }, stateTitle: { color: palette.dark, fontSize: 16, fontWeight: '900' }, stateMessage: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }, retryButton: { alignItems: 'center', alignSelf: 'flex-start', justifyContent: 'center', marginTop: 8, minHeight: 44, paddingHorizontal: 6 }, retryText: { color: palette.primaryDark, fontSize: 14, fontWeight: '900' },
  modalBackdrop: { alignItems: 'center', backgroundColor: '#102D29AA', flex: 1, justifyContent: 'center', padding: 20 }, modalCard: { backgroundColor: palette.surface, borderColor: palette.gold, borderRadius: radius.hero, borderWidth: 1.5, maxWidth: 460, padding: 21, width: '100%', ...shadows.level3 }, modalMark: { alignItems: 'center', backgroundColor: palette.sage, borderRadius: 15, height: 44, justifyContent: 'center', width: 44 }, modalMarkText: { color: palette.primary, fontSize: 22, fontWeight: '900' }, modalTitle: { color: palette.dark, fontSize: 25, fontWeight: '900', marginTop: 15 }, modalSubtitle: { color: palette.muted, fontSize: 16, lineHeight: 23, marginTop: 6 }, levelOption: { alignItems: 'center', backgroundColor: palette.background, borderColor: palette.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', marginTop: 11, minHeight: 72, paddingHorizontal: 13, paddingVertical: 10 }, levelOptionCopy: { flex: 1 }, levelName: { color: palette.dark, fontSize: 18, fontWeight: '900' }, levelDescription: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: 3 }, recommendedPill: { backgroundColor: palette.sage, borderColor: palette.border, borderRadius: 10, borderWidth: 1, marginLeft: 7, paddingHorizontal: 8, paddingVertical: 6 }, recommendedPillText: { color: palette.primaryDark, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }, levelArrow: { color: palette.primaryDark, fontSize: 25, marginLeft: 9 }, cancelButton: { alignItems: 'center', justifyContent: 'center', marginTop: 5, minHeight: 50 }, cancelText: { color: palette.muted, fontSize: 15, fontWeight: '800' }, pressed: { opacity: 0.83, transform: [{ scale: 0.99 }] },
});
