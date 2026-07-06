import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getEmotionalTrends } from '../api/emotionalSupportApi';

const DEMO_USER_ID = 1;

function formatLabel(value = '') {
  return String(value || 'neutral').replace(/_/g, ' ');
}

function formatDate(value) {
  if (!value) {
    return 'Recent';
  }

  return new Date(value).toLocaleDateString();
}

export default function EmotionalTrendScreen() {
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadTrends() {
      try {
        setLoading(true);
        setErrorMessage('');
        const response = await getEmotionalTrends(DEMO_USER_ID);

        if (isMounted) {
          setTrends(response);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error.message || 'We could not load emotional trends right now.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadTrends();
    return () => {
      isMounted = false;
    };
  }, []);

  const narrativeLogs = trends?.narrative_logs || trends?.recentNarrativeLogs || [];
  const moodCheckins = trends?.mood_checkins || trends?.recentMoodCheckins || [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Mood & Emotion History</Text>
          <Text style={styles.subtitle}>Review recent mood, emotion, and support trends.</Text>
        </View>

        {loading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color="#236F60" />
            <Text style={styles.statusText}>Loading trends...</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Emotional Analysis</Text>
          {narrativeLogs.length ? (
            narrativeLogs.map((item) => (
              <View key={item.interaction_id || item.logged_at} style={styles.trendCard}>
                <Text style={styles.trendTitle}>{formatLabel(item.detected_emotional_state)}</Text>
                <Text style={styles.trendText}>
                  Risk: {formatLabel(item.risk_level)} | {formatDate(item.logged_at)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No emotional analysis history yet.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Mood Check-Ins</Text>
          {moodCheckins.length ? (
            moodCheckins.map((item) => (
              <View key={item.checkin_id || item.logged_at} style={styles.trendCard}>
                <Text style={styles.trendTitle}>{item.mood_label}</Text>
                <Text style={styles.trendText}>
                  Score: {item.mood_score} | {formatDate(item.logged_at)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No mood check-ins yet.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F1F8F5' },
  container: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 40 },
  header: { marginBottom: 22 },
  title: { color: '#173D35', fontSize: 34, fontWeight: '900', lineHeight: 42 },
  subtitle: { color: '#526963', fontSize: 18, fontWeight: '700', lineHeight: 27, marginTop: 8 },
  statusCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E8E0',
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row',
    marginBottom: 18,
    padding: 16,
  },
  statusText: { color: '#526963', fontSize: 17, fontWeight: '700', marginLeft: 12 },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderColor: '#F3A6A6',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 18,
    padding: 14,
  },
  errorText: { color: '#991B1B', fontSize: 16, fontWeight: '800', lineHeight: 23 },
  section: { marginTop: 18 },
  sectionTitle: { color: '#173D35', fontSize: 23, fontWeight: '900', marginBottom: 12 },
  trendCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E8E0',
    borderRadius: 18,
    borderWidth: 2,
    marginBottom: 12,
    padding: 16,
  },
  trendTitle: { color: '#173D35', fontSize: 22, fontWeight: '900', textTransform: 'capitalize' },
  trendText: { color: '#526963', fontSize: 16, fontWeight: '700', marginTop: 6 },
  emptyText: { color: '#526963', fontSize: 17, fontWeight: '700', lineHeight: 24 },
});
