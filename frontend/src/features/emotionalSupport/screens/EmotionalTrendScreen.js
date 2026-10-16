import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { getWellnessSummary, getWellnessTrends } from '../api/emotionalSupportApi';
import { Button, Card, InlineState, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { activityStyles, colors, emotionStyles, radius, screenInsets, spacing, type } from '../theme';
const { formatDuration } = require('../utils/wellnessFormatters');
const { getCheckinSampleLabel, getMetricColumnCount } = require('../utils/wellnessDashboardLayout');

const label = (value) => String(value || 'Not available').replace(/_(easy|medium)$/i, '').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
const pct = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const date = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export default function EmotionalTrendScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const { fontScale } = useWindowDimensions();
  const [period, setPeriod] = useState('7d');
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      if (!elderId) throw new Error('A user account is required to load wellness trends.');
      setData(await getWellnessTrends(elderId, period));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [elderId, period]);

  const loadSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      setSummaryError(false);
      if (!elderId) throw new Error('A user account is required to load the summary.');
      setSummary(await getWellnessSummary(elderId, period));
    } catch {
      setSummaryError(true);
    } finally {
      setSummaryLoading(false);
    }
  }, [elderId, period]);

  useEffect(() => { load(); }, [load]);

  const emotional = data?.emotional || {};
  const activities = data?.activities || {};
  const cognitive = data?.cognitive_engagement || {};
  const differentActivities = new Set(
    (activities.recent_activity_log || []).map((item) => String(item.activity_type || item.activity_code || '').replace(/_(easy|medium)$/i, ''))
  ).size;

  function toggleSummary() {
    if (summary) {
      setSummary(null);
      setSummaryError(false);
      return;
    }
    loadSummary();
  }

  const summaryMetrics = [
    { value: emotional.total_checkins || 0, label: 'Check-ins', symbol: '◉', accent: '#3976A0', tint: colors.sky },
    { value: activities.total_completed || 0, label: 'Activities', symbol: '✓', accent: colors.primary, tint: colors.mint },
    { value: differentActivities, label: 'Different activities tried', symbol: '✦', wide: true, accent: '#73558F', tint: colors.lavender },
  ];
  const cognitiveMetrics = [
    { value: cognitive.activities_completed ?? '—', label: 'Activities completed', symbol: '✓', accent: colors.primary, tint: colors.mint },
    { value: cognitive.average_activity_accuracy == null ? '—' : pct(cognitive.average_activity_accuracy), label: 'Activity accuracy', symbol: '%', accent: '#3976A0', tint: colors.sky },
    { value: cognitive.recent_difficulty ? label(cognitive.recent_difficulty) : '—', label: 'Recent difficulty', symbol: '◉', accent: '#73558F', tint: colors.lavender },
    { value: formatDuration(cognitive.average_response_time_ms), label: 'Average recorded time', symbol: '◷', accent: '#9A654C', tint: colors.peach },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <WellnessBackdrop />
      <ScrollView contentContainerStyle={s.container}>
        <ScreenHeader navigation={navigation} title="Your Wellness" subtitle="Your recent check-ins and engagement activity." />

        <View accessibilityRole="tablist" style={s.tabs}>
          {[[ '7d', '7 Days' ], [ '30d', '30 Days' ]].map(([value, title]) => (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: period === value }}
              key={value}
              onPress={() => setPeriod(value)}
              style={({ pressed }) => [s.tab, period === value && s.tabActive, pressed && s.pressed]}
            >
              <Text style={[s.tabText, period === value && s.tabTextActive]}>{title}</Text>
            </Pressable>
          ))}
        </View>

        <InlineState loading={loading} error={error} onRetry={load} emptyText="Loading your trends…" />

        {!loading && !error && data ? (
          <>
            <MetricsGrid metrics={summaryMetrics} fontScale={fontScale} />

            {activities.reminiscence?.completed_count ? (
              <Card style={s.frequent}>
                <Text style={s.meta}>Memory moments this period</Text>
                <Text style={s.frequentValue}>{activities.reminiscence.completed_count}</Text>
              </Card>
            ) : null}

            <Card style={s.frequent}>
              <Text style={s.meta}>Most frequent state</Text>
              <Text style={s.frequentValue}>{emotional.total_checkins ? label(emotional.most_frequent_emotion) : 'No check-ins yet'}</Text>
            </Card>

            <Section title="Emotional Check-Ins">
              {emotional.total_checkins ? (
                <View style={s.distributionNote}>
                  <Text style={s.distributionNoteTitle}>Share of recorded check-ins</Text>
                  <Text style={s.distributionNoteText}>{getCheckinSampleLabel(emotional.total_checkins)}.</Text>
                </View>
              ) : null}
              {emotional.total_checkins
                ? emotional.distribution?.filter((item) => item.count).map((item) => <EmotionBar key={item.emotion} item={item} />)
                : <Empty title="No check-ins yet" text="Complete a short check-in to begin building your wellness history." />}
              {emotional.timeline?.length ? <Text style={s.subheading}>Recent check-ins</Text> : null}
              {emotional.timeline?.map((item, index) => {
                const look = emotionStyles[item.emotion] || emotionStyles.neutral;
                return (
                  <View key={`${item.completed_at}-${index}`} style={s.timeline}>
                    <Text style={s.date}>{date(item.completed_at)}</Text>
                    <View style={[s.dot, { backgroundColor: look.accent }]} />
                    <Text style={s.timelineLabel}>{label(item.emotion)}</Text>
                  </View>
                );
              })}
            </Section>

            <Section title="Cognitive Engagement">
              {cognitive.scored_activities ? (
                <>
                  <MetricsGrid metrics={cognitiveMetrics} fontScale={fontScale} />
                  <View accessibilityLabel="Recorded time information" style={s.infoRow}>
                    <View accessibilityElementsHidden style={s.infoIcon}><Text style={s.infoIconText}>i</Text></View>
                    <Text style={s.infoText}>Recorded time is measured on each question. Older records may include idle time.</Text>
                  </View>
                  <Text style={s.subheading}>Activity Accuracy</Text>
                  {cognitive.accuracy_history?.length === 1 ? (
                    <View style={s.onePoint}>
                      <Text style={s.onePointValue}>{pct(cognitive.accuracy_history[0].accuracy)}</Text>
                      <Text style={s.meta}>{date(cognitive.accuracy_history[0].date)}</Text>
                      <Text style={s.body}>1 activity recorded</Text>
                    </View>
                  ) : cognitive.accuracy_history?.map((item, index) => <Accuracy key={`${item.date}-${index}`} item={item} />)}
                  <Text style={s.note}>Difficulty and accuracy describe app activities only, not a medical assessment.</Text>
                </>
              ) : (
                <Empty title="No cognitive activities completed yet" text="Your activity history will appear here after completion." />
              )}
            </Section>

            <Section title="Recent Activity">
              {activities.recent_activity_log?.length
                ? activities.recent_activity_log.map((item, index) => <Activity key={`${item.completed_at}-${index}`} item={item} />)
                : <Empty title="No activities yet" text="Recommended activities you complete will appear here." />}
            </Section>

            <Button variant="secondary" label={summary ? 'Hide Wellness Summary' : 'View Wellness Summary'} loading={summaryLoading} onPress={toggleSummary} style={s.summaryButton} />
            {summaryError ? (
              <View accessibilityLiveRegion="polite" style={s.summaryNotice}>
                <Text style={s.summaryNoticeText}>The wellness summary could not load.</Text>
                <Pressable accessibilityRole="button" onPress={loadSummary} style={s.summaryRetry}>
                  <Text style={s.summaryRetryText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}
            {summary ? (
              <Card style={s.summaryPanel}>
                <Text style={s.cardTitle}>{summary.title || 'Wellness Summary'}</Text>
                <Text style={s.body}>{summary.disclaimer || 'This summary supports wellbeing and engagement and is not a medical diagnosis.'}</Text>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricsGrid({ metrics, fontScale }) {
  const [gridWidth, setGridWidth] = useState(0);
  const columnCount = getMetricColumnCount(gridWidth, fontScale);
  const cardWidth = gridWidth > 0
    ? (columnCount === 2 ? (gridWidth - spacing.md) / 2 : gridWidth)
    : '100%';

  return (
    <View
      onLayout={({ nativeEvent }) => setGridWidth((previous) => (
        Math.abs(previous - nativeEvent.layout.width) > 1 ? nativeEvent.layout.width : previous
      ))}
      style={[s.metricsGrid, columnCount === 1 && s.metricsGridStacked]}
    >
      {metrics.map((metric) => (
        <View
          key={metric.label}
          accessible
          accessibilityLabel={`${metric.label}: ${metric.value ?? 'Not available'}`}
          style={[s.metric, { width: metric.wide && columnCount === 2 ? gridWidth : cardWidth }]}
        >
          <View style={[s.metricIcon, { backgroundColor: metric.tint || colors.mint }]}>
            <Text style={[s.metricIconText, { color: metric.accent || colors.primary }]}>{metric.symbol}</Text>
          </View>
          <Text textBreakStrategy="simple" style={s.metricValue}>{metric.value ?? '—'}</Text>
          <Text textBreakStrategy="simple" style={s.metricLabel}>{metric.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }) {
  return <Card style={s.section}><Text style={s.sectionTitle}>{title}</Text>{children}</Card>;
}

function EmotionBar({ item }) {
  const look = emotionStyles[item.emotion] || emotionStyles.neutral;
  return (
    <View style={s.bar}>
      <View style={s.barHead}>
        <View style={[s.dot, { backgroundColor: look.accent }]} />
        <Text style={s.barLabel}>{label(item.emotion)}</Text>
        <Text style={s.meta}>{item.percentage}%</Text>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={`${label(item.emotion)}: ${item.percentage}% share of recorded check-ins`} accessibilityValue={{ min: 0, max: 100, now: item.percentage }} style={s.track}>
        <View style={[s.fill, { backgroundColor: look.accent, width: `${item.percentage}%` }]} />
      </View>
    </View>
  );
}

function Accuracy({ item }) {
  return (
    <View style={s.accuracy}>
      <Text style={s.date}>{date(item.date)}</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Number(item.accuracy || 0) * 100 }} style={s.accuracyTrack}>
        <View style={[s.fill, { backgroundColor: colors.primary, width: `${Number(item.accuracy || 0) * 100}%` }]} />
      </View>
      <Text style={s.accuracyValue}>{pct(item.accuracy)}</Text>
    </View>
  );
}

function Activity({ item }) {
  const key = String(item.activity_code || '').replace(/_(easy|medium)$/i, '');
  const look = activityStyles[key] || { accent: colors.primary, soft: colors.mint, symbol: '✓' };
  return (
    <View style={s.activity}>
      <View style={[s.activityIcon, { backgroundColor: look.soft }]}><Text style={[s.activitySymbol, { color: look.accent }]}>{look.symbol}</Text></View>
      <View style={s.activityCopy}>
        <Text style={s.cardTitle}>{label(item.activity_code)}</Text>
        <Text style={s.meta}>{label(item.difficulty)} · {date(item.completed_at)}{item.activity_source === 'self_selected' ? ' · Chosen by you' : ''}</Text>
        <Text style={[s.result, { color: look.accent }]}>{item.accuracy == null ? 'Completed' : `Activity Accuracy ${pct(item.accuracy)}`}</Text>
      </View>
    </View>
  );
}

function Empty({ title, text }) {
  return <View style={s.empty}><Text style={s.emptyIcon}>○</Text><View style={s.emptyCopy}><Text style={s.cardTitle}>{title}</Text><Text style={s.body}>{text}</Text></View></View>;
}

const s = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  container: { paddingBottom: screenInsets.bottom + spacing.xl, paddingHorizontal: spacing.xl, paddingTop: screenInsets.top },
  tabs: { backgroundColor: colors.mint, borderRadius: radius.button, flexDirection: 'row', marginBottom: spacing.xl, padding: 4 },
  tab: { alignItems: 'center', borderRadius: 13, flex: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tabActive: { backgroundColor: colors.primary }, tabText: { ...type.body, color: colors.secondary, fontWeight: '800', textAlign: 'center' }, tabTextActive: { color: colors.white },
  metricsGrid: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.sm },
  metricsGridStacked: { flexDirection: 'column' },
  metric: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, minWidth: 0, padding: spacing.md },
  metricIcon: { alignItems: 'center', borderRadius: radius.small, height: 38, justifyContent: 'center', width: 38 },
  metricIconText: { color: colors.primary, fontSize: 19, fontWeight: '900' },
  metricValue: { ...type.section, alignSelf: 'stretch', color: colors.text, marginTop: spacing.sm },
  metricLabel: { ...type.body, color: colors.secondary, marginTop: spacing.xs },
  distributionNote: { backgroundColor: '#f4f6f2', borderRadius: radius.small, marginBottom: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  distributionNoteTitle: { ...type.meta, color: colors.text, fontWeight: '900' },
  distributionNoteText: { ...type.meta, color: colors.secondary, marginTop: 2 },
  frequent: { backgroundColor: colors.mint, marginTop: spacing.md }, frequentValue: { ...type.section, color: colors.text, marginTop: spacing.xs, textTransform: 'capitalize' },
  section: { marginTop: spacing.md }, sectionTitle: { ...type.section, color: colors.text, marginBottom: spacing.md },
  meta: { ...type.meta, color: colors.secondary }, subheading: { ...type.card, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.lg },
  bar: { marginBottom: spacing.md }, barHead: { alignItems: 'center', flexDirection: 'row' }, dot: { borderRadius: 6, height: 10, marginRight: spacing.sm, width: 10 },
  barLabel: { ...type.body, color: colors.text, flex: 1, fontWeight: '800', textTransform: 'capitalize' },
  track: { backgroundColor: colors.border, borderRadius: 7, height: 11, marginTop: spacing.sm, overflow: 'hidden' },
  accuracyTrack: { backgroundColor: colors.border, borderRadius: 7, flex: 1, height: 11, overflow: 'hidden' }, fill: { borderRadius: 7, height: 11 },
  timeline: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', minHeight: 48, paddingVertical: spacing.xs }, date: { ...type.meta, color: colors.secondary, minWidth: 58 },
  timelineLabel: { ...type.body, color: colors.text, fontWeight: '800', textTransform: 'capitalize' },
  accuracy: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }, accuracyValue: { ...type.meta, color: colors.text, textAlign: 'right', width: 48 },
  onePoint: { backgroundColor: colors.mint, borderRadius: radius.button, padding: spacing.lg }, onePointValue: { ...type.section, color: colors.primary },
  body: { ...type.body, color: colors.secondary, marginTop: spacing.xs }, note: { ...type.meta, color: colors.secondary, marginTop: spacing.lg },
  infoRow: { alignItems: 'flex-start', backgroundColor: '#f4f6f2', borderRadius: radius.small, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  infoIcon: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 24, justifyContent: 'center', marginTop: 1, width: 24 },
  infoIconText: { color: colors.primary, fontSize: 15, fontWeight: '900' }, infoText: { ...type.meta, color: colors.secondary, flex: 1, minWidth: 0 },
  activity: { alignItems: 'flex-start', borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', paddingVertical: spacing.md },
  activityIcon: { alignItems: 'center', borderRadius: radius.button, height: 52, justifyContent: 'center', width: 52 }, activitySymbol: { fontSize: 17, fontWeight: '900' },
  activityCopy: { flex: 1, marginLeft: spacing.md, minWidth: 0 }, cardTitle: { ...type.card, color: colors.text }, result: { ...type.meta, fontWeight: '900', marginTop: spacing.xs },
  empty: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md }, emptyIcon: { color: colors.primary, fontSize: 32, lineHeight: 36 }, emptyCopy: { flex: 1, minWidth: 0 },
  summaryButton: { alignSelf: 'stretch', marginTop: spacing.xl }, summaryPanel: { marginTop: spacing.md },
  summaryNotice: { alignItems: 'center', backgroundColor: colors.errorBg, borderRadius: radius.button, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: spacing.md, padding: spacing.md },
  summaryNoticeText: { ...type.meta, color: colors.text, flex: 1, minWidth: 150 }, summaryRetry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }, summaryRetryText: { ...type.meta, color: colors.primary, fontWeight: '900' },
  pressed: { opacity: 0.82 },
});
