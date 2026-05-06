import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getTrendSummary } from '../api/emotionalSupportApi';
import ActionButton from '../components/ActionButton';
import InsightCard from '../components/InsightCard';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function ElderHomeScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      try {
        setLoading(true);
        setError('');
        const { data } = await getTrendSummary(elderId);

        if (active) {
          setSummary(data);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.error || 'Failed to load elder emotional summary.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSummary();
    return () => {
      active = false;
    };
  }, [elderId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.kicker}>Emotional Support</Text>
        <Text style={styles.title}>Daily emotional and cognitive support</Text>
        <Text style={styles.subtitle}>
          This screen is the elder entry point for check-ins, support chat, and cognitive exercises.
        </Text>

        <StatusMessage loading={loading} error={error} empty={!summary} emptyText="No trend summary available yet." />

        {summary ? (
          <View style={styles.grid}>
            <InsightCard
              title="Dominant 7-day mood"
              value={summary.dominantEmotion7d}
              subtitle={`Negative moods: ${summary.negativeMoodCount7d}`}
            />
            <InsightCard
              title="Open alerts"
              value={String(summary.openAlerts)}
              subtitle={`Stress avg: ${summary.averageStressScore7d?.toFixed?.(2) || summary.averageStressScore7d}`}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <ActionButton label="Start Daily Check-In" onPress={() => navigation.navigate('MoodCheckIn')} />
          <ActionButton label="View Mood History" variant="secondary" onPress={() => navigation.navigate('MoodHistory')} />
          <ActionButton label="Caregiver View" variant="secondary" onPress={() => navigation.navigate('CaregiverDashboard')} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F5EF' },
  container: { padding: 20, gap: 16 },
  kicker: { fontSize: 13, fontWeight: '700', color: '#7A6A4F', textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: '#2B241A' },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#5D5649' },
  grid: { gap: 12 },
  actions: { gap: 12 },
});
