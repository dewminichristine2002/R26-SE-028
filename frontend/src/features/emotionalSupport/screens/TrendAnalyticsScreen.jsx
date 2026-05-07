import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCaregiverElderDetail, getTrendSummary } from '../api/emotionalSupportApi';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function TrendAnalyticsScreen({ route }) {
  const { caregiverId, elderId: defaultElderId } = useEmotionalSupportContext();
  const elderId = route.params?.elderId || defaultElderId;
  const [summary, setSummary] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      try {
        setLoading(true);
        setError('');
        const [summaryResponse, detailResponse] = await Promise.all([
          getTrendSummary(elderId),
          getCaregiverElderDetail(caregiverId, elderId),
        ]);

        if (active) {
          setSummary(summaryResponse.data);
          setDetail(detailResponse.data);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.error || 'Failed to load trend analytics.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAnalytics();
    return () => {
      active = false;
    };
  }, [caregiverId, elderId]);

  const trendBars = summary
    ? [
        { label: 'Dominant mood', value: summary.negativeMoodCount7d, text: summary.dominantEmotion7d },
        { label: 'Stress average', value: Math.round((summary.averageStressScore7d || 0) * 5), text: String(summary.averageStressScore7d) },
        { label: 'Loneliness average', value: Math.round((summary.averageLonelinessScore7d || 0) * 5), text: String(summary.averageLonelinessScore7d) },
        { label: 'Open alerts', value: summary.openAlerts || 0, text: String(summary.openAlerts) },
      ]
    : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Trend analytics</Text>
        <StatusMessage loading={loading} error={error} empty={!summary} emptyText="No trend analytics found." />
        {trendBars.map((bar) => (
          <View key={bar.label} style={styles.row}>
            <Text style={styles.label}>{bar.label}: {bar.text}</Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(Math.max(bar.value, 1), 5) * 20}%` }]} />
            </View>
          </View>
        ))}
        {detail?.sessions?.map((session) => (
          <View key={session.sessionId} style={styles.sessionCard}>
            <Text style={styles.sessionTitle}>{session.detectedEmotion}</Text>
            <Text style={styles.sessionMeta}>Risk: {session.riskLevel}</Text>
            <Text style={styles.sessionMeta}>{new Date(session.createdAt).toLocaleString()}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F6F0' },
  container: { padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', color: '#33291F' },
  row: { gap: 8 },
  label: { fontSize: 15, color: '#5F5345' },
  track: { height: 12, borderRadius: 999, backgroundColor: '#E7DFD0', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#7E8B5A', borderRadius: 999 },
  sessionCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4DDD0',
    backgroundColor: '#FFFFFF',
    gap: 4,
  },
  sessionTitle: { fontSize: 16, fontWeight: '700', color: '#3B3227', textTransform: 'capitalize' },
  sessionMeta: { fontSize: 14, color: '#6C604F' },
});
