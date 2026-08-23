import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getWellnessSummary, getWellnessTrends } from '../api/emotionalSupportApi';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

const label = (value) => String(value || 'Not available').replace(/_/g, ' ');
const percent = (value) => `${Math.round(Number(value) * 100)}%`;
const seconds = (value) => value == null ? 'Not available' : `${Math.round(value / 100) / 10} sec`;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

export default function EmotionalTrendScreen() {
  const { elderId } = useEmotionalSupportContext();
  const [period, setPeriod] = useState('7d');
  const [trends, setTrends] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSummary(null);
    if (!elderId) { setError('Please sign in again to view wellness trends.'); setLoading(false); return () => { active = false; }; }
    getWellnessTrends(elderId, period).then((data) => active && setTrends(data)).catch((requestError) => active && setError(requestError.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [elderId, period]);

  async function showSummary() {
    try { setSummary(await getWellnessSummary(elderId, period)); } catch (requestError) { setError(requestError.message); }
  }

  const emotional = trends?.emotional;
  const activities = trends?.activities;
  const cognitive = trends?.cognitive_engagement;
  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>Your Wellness Trends</Text>
    <Text style={styles.subtitle}>App-based emotional check-ins and engagement activity history.</Text>
    <View style={styles.tabs}>{['7d', '30d'].map((value) => <Pressable key={value} style={[styles.tab, period === value && styles.tabActive]} onPress={() => setPeriod(value)}><Text style={[styles.tabText, period === value && styles.tabTextActive]}>{value === '7d' ? '7 Days' : '30 Days'}</Text></Pressable>)}</View>
    {loading ? <View style={styles.loading}><ActivityIndicator color="#236F60" /><Text style={styles.muted}>Loading history…</Text></View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {!loading && trends ? <>
      <View style={styles.summaryRow}>
        <SummaryCard title="Check-ins" value={emotional.total_checkins} />
        <SummaryCard title="Activities" value={activities.total_completed} />
        <SummaryCard title="Frequent State" value={label(emotional.most_frequent_emotion)} />
      </View>
      <Section title="Emotional Check-In History">
        {emotional.total_checkins ? emotional.distribution.filter((item) => item.count).map((item) => <View key={item.emotion} style={styles.barRow}><Text style={styles.barLabel}>{label(item.emotion)}</Text><View style={styles.barTrack}><View style={[styles.barFill, { width: `${item.percentage}%` }]} /></View><Text style={styles.barValue}>{item.count} · {item.percentage}%</Text></View>) : <Empty text="No completed emotional check-ins in this period." />}
        {emotional.timeline.map((item) => <View key={item.completed_at} style={styles.timelineRow}><Text style={styles.timelineDate}>{dateLabel(item.completed_at)}</Text><Text style={styles.timelineEmotion}>{label(item.emotion)}</Text><Text style={styles.timelineRisk}>{label(item.risk)} support</Text></View>)}
      </Section>
      <Section title="Cognitive Activity">
        {cognitive.scored_activities ? <>
          <Metric label="Activities Completed" value={cognitive.activities_completed} />
          <Metric label="Average Activity Accuracy" value={percent(cognitive.average_activity_accuracy)} />
          <Metric label="Recent Difficulty" value={label(cognitive.recent_difficulty)} />
          <Metric label="Average Activity Time" value={seconds(cognitive.average_response_time_ms)} />
          <Text style={styles.subheading}>Activity Accuracy Over Time</Text>
          {cognitive.accuracy_history.map((item, index) => <View key={`${item.date}-${item.activity_code}-${index}`} style={styles.accuracyRow}><Text style={styles.accuracyDate}>{dateLabel(item.date)}</Text><View style={styles.accuracyTrack}><View style={[styles.accuracyFill, { width: `${item.accuracy * 100}%` }]} /></View><Text style={styles.accuracyValue}>{percent(item.accuracy)}</Text></View>)}
          <Text style={styles.note}>Difficulty reflects the activity used by the app, not a medical assessment.</Text>
        </> : <Empty text="No cognitive activity data yet." />}
      </Section>
      <Section title="Recent Activity">
        {activities.recent_activity_log.length ? activities.recent_activity_log.map((item, index) => <View key={`${item.completed_at}-${index}`} style={styles.activityRow}><View><Text style={styles.activityTitle}>{label(item.activity_code)}</Text><Text style={styles.muted}>{dateLabel(item.completed_at)} · {label(item.difficulty)}</Text></View><Text style={styles.activityResult}>{item.accuracy == null ? 'Completed' : `Activity Accuracy: ${percent(item.accuracy)}`}</Text></View>) : <Empty text="No completed activities in this period." />}
      </Section>
      <Pressable style={styles.summaryButton} onPress={showSummary}><Text style={styles.summaryButtonText}>View Wellness Summary</Text></Pressable>
      {summary ? <View style={styles.disclaimerCard}><Text style={styles.subheading}>{summary.title}</Text><Text style={styles.muted}>Check-ins: {summary.checkins_completed} · Activities: {summary.activities_completed}</Text><Text style={styles.disclaimer}>{summary.disclaimer}</Text></View> : null}
    </> : null}
  </ScrollView></SafeAreaView>;
}

function SummaryCard({ title, value }) { return <View style={styles.summaryCard}><Text style={styles.summaryValue}>{value ?? '—'}</Text><Text style={styles.summaryLabel}>{title}</Text></View>; }
function Section({ title, children }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function Metric({ label: title, value }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{title}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function Empty({ text }) { return <Text style={styles.empty}>{text}</Text>; }

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#F2F7F4', flex: 1 }, container: { padding: 22, paddingBottom: 44 }, title: { color: '#173D35', fontSize: 34, fontWeight: '900', lineHeight: 42 }, subtitle: { color: '#526963', fontSize: 18, fontWeight: '700', lineHeight: 27, marginTop: 8 },
  tabs: { backgroundColor: '#DDEBE5', borderRadius: 18, flexDirection: 'row', marginTop: 22, padding: 4 }, tab: { alignItems: 'center', borderRadius: 14, flex: 1, minHeight: 52, justifyContent: 'center' }, tabActive: { backgroundColor: '#236F60' }, tabText: { color: '#466159', fontSize: 18, fontWeight: '900' }, tabTextActive: { color: '#FFF' }, loading: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 24 }, error: { color: '#991B1B', fontSize: 17, fontWeight: '800', marginTop: 18 },
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 22 }, summaryCard: { backgroundColor: '#FFF', borderRadius: 18, flex: 1, minHeight: 112, padding: 14 }, summaryValue: { color: '#173D35', fontSize: 24, fontWeight: '900', textTransform: 'capitalize' }, summaryLabel: { color: '#61746E', fontSize: 13, fontWeight: '800', marginTop: 8 },
  section: { backgroundColor: '#FFF', borderRadius: 22, marginTop: 20, padding: 20 }, sectionTitle: { color: '#173D35', fontSize: 24, fontWeight: '900', marginBottom: 16 }, subheading: { color: '#244C42', fontSize: 19, fontWeight: '900', marginTop: 18 },
  barRow: { marginBottom: 16 }, barLabel: { color: '#263D37', fontSize: 17, fontWeight: '900', textTransform: 'capitalize' }, barTrack: { backgroundColor: '#E5EEE9', borderRadius: 8, height: 14, marginTop: 7, overflow: 'hidden' }, barFill: { backgroundColor: '#54A287', borderRadius: 8, height: 14 }, barValue: { color: '#61746E', fontSize: 14, fontWeight: '800', marginTop: 5 },
  timelineRow: { alignItems: 'center', borderTopColor: '#E5EEE9', borderTopWidth: 1, flexDirection: 'row', marginTop: 10, paddingTop: 12 }, timelineDate: { color: '#61746E', fontSize: 15, fontWeight: '800', width: 70 }, timelineEmotion: { color: '#173D35', flex: 1, fontSize: 17, fontWeight: '900', textTransform: 'capitalize' }, timelineRisk: { color: '#61746E', fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  metric: { alignItems: 'center', borderBottomColor: '#E5EEE9', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }, metricLabel: { color: '#526963', flex: 1, fontSize: 17, fontWeight: '800' }, metricValue: { color: '#173D35', fontSize: 19, fontWeight: '900', textTransform: 'capitalize' },
  accuracyRow: { alignItems: 'center', flexDirection: 'row', marginTop: 12 }, accuracyDate: { color: '#61746E', fontSize: 14, fontWeight: '800', width: 54 }, accuracyTrack: { backgroundColor: '#E5EEE9', borderRadius: 7, flex: 1, height: 13, overflow: 'hidden' }, accuracyFill: { backgroundColor: '#D5A63D', height: 13 }, accuracyValue: { color: '#526963', fontSize: 14, fontWeight: '900', marginLeft: 9, width: 42 }, note: { color: '#61746E', fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 16 },
  activityRow: { borderBottomColor: '#E5EEE9', borderBottomWidth: 1, paddingVertical: 14 }, activityTitle: { color: '#173D35', fontSize: 18, fontWeight: '900', textTransform: 'capitalize' }, activityResult: { color: '#236F60', fontSize: 15, fontWeight: '900', marginTop: 7 }, muted: { color: '#61746E', fontSize: 15, fontWeight: '700', lineHeight: 22, marginTop: 4 }, empty: { color: '#61746E', fontSize: 17, fontWeight: '700', lineHeight: 25 },
  summaryButton: { alignItems: 'center', backgroundColor: '#236F60', borderRadius: 20, justifyContent: 'center', marginTop: 22, minHeight: 68 }, summaryButtonText: { color: '#FFF', fontSize: 20, fontWeight: '900' }, disclaimerCard: { backgroundColor: '#FFF', borderRadius: 20, marginTop: 16, padding: 20 }, disclaimer: { color: '#526963', fontSize: 14, fontWeight: '700', lineHeight: 21, marginTop: 12 },
});
