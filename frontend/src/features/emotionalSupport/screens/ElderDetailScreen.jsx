import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCaregiverElderDetail } from '../api/emotionalSupportApi';
import ActionButton from '../components/ActionButton';
import InsightCard from '../components/InsightCard';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function ElderDetailScreen({ navigation, route }) {
  const { caregiverId, elderId: defaultElderId } = useEmotionalSupportContext();
  const elderId = route.params?.elderId || defaultElderId;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      try {
        setLoading(true);
        setError('');
        const { data } = await getCaregiverElderDetail(caregiverId, elderId);

        if (active) {
          setDetail(data);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.error || 'Failed to load elder detail.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      active = false;
    };
  }, [caregiverId, elderId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Elder emotional detail</Text>
        <StatusMessage loading={loading} error={error} empty={!detail} emptyText="No elder detail found." />
        {detail ? (
          <>
            <Text style={styles.subtitle}>{detail.elder.name}, age {detail.elder.age}</Text>
            <View style={styles.grid}>
              <InsightCard
                title="Dominant 7-day mood"
                value={detail.summary.dominantEmotion7d}
                subtitle={`Negative moods: ${detail.summary.negativeMoodCount7d}`}
              />
              <InsightCard
                title="Open alerts"
                value={String(detail.summary.openAlerts)}
                subtitle={`Check-in completion: ${(detail.summary.checkInCompletionRate7d * 100).toFixed(0)}%`}
              />
            </View>
            <ActionButton
              label="Open Trend Analytics"
              onPress={() => navigation.navigate('TrendAnalytics', { elderId })}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F8F6' },
  container: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#21352F' },
  subtitle: { fontSize: 16, color: '#4B6159' },
  grid: { gap: 12 },
});
