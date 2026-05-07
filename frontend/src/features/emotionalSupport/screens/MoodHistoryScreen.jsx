import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getEmotionHistory } from '../api/emotionalSupportApi';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { emotionColors } from '../utils/emotionColors';

export default function MoodHistoryScreen() {
  const { elderId } = useEmotionalSupportContext();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      try {
        setLoading(true);
        setError('');
        const { data } = await getEmotionHistory(elderId, 10);

        if (active) {
          setItems(data.items || []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.error || 'Failed to load emotional history.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadHistory();
    return () => {
      active = false;
    };
  }, [elderId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Mood history</Text>
        <StatusMessage loading={loading} error={error} empty={!items.length} emptyText="No emotional history found yet." />
        {items.map((item) => (
          <View key={item.sessionId} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: emotionColors[item.detectedEmotion] }]} />
            <View style={styles.content}>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
              <Text style={styles.emotion}>{item.detectedEmotion}</Text>
            </View>
            <Text style={styles.risk}>{item.riskLevel}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FAF7F1' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#30261C', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0D8CC',
  },
  dot: { width: 12, height: 12, borderRadius: 999 },
  content: { flex: 1 },
  date: { fontSize: 13, color: '#7A6C5B' },
  emotion: { fontSize: 16, fontWeight: '600', color: '#372E24', textTransform: 'capitalize' },
  risk: { fontSize: 14, color: '#725E47', textTransform: 'capitalize' },
});
