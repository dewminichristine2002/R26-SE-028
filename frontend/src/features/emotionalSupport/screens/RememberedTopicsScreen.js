import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  clearReminiscenceTopics,
  deleteReminiscenceTopic,
  getReminiscenceTopics,
} from '../api/emotionalSupportApi';
import { Button, Card, InlineState, OrganicIcon, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { colors, radius, screenInsets, spacing, type } from '../theme';

const prettyTopic = (value = '') => String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Remembered Topics management.
 * The elder can: view each topic, remove one topic, or clear all topics.
 * Raw backend data is never exposed — only friendly topic labels.
 */
export default function RememberedTopicsScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const result = await getReminiscenceTopics(elderId);
      setTopics(result.topics || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [elderId]);
  useEffect(() => { load(); }, [load]);

  function openTopic(topic) {
    navigation.navigate('MemoryMomentScreen', {
      prompt: `Would you like to remember ${topic.topic_label || topic.topic_type.replace(/_/g, ' ')}?`,
    });
  }

  function confirmRemove(topic) {
    Alert.alert(
      'Remove this topic?',
      `ElderMeds will stop using “${prettyTopic(topic.topic_label || topic.topic_type)}” in future memory activities.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteReminiscenceTopic(topic.id, elderId);
              setTopics((current) => current.filter((item) => item.id !== topic.id));
            } catch {
              setError(true);
            }
          },
        },
      ]
    );
  }

  function confirmClearAll() {
    Alert.alert(
      'Clear all remembered topics?',
      'All remembered topics will be removed. Your past conversations are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearReminiscenceTopics(elderId);
              setTopics([]);
            } catch {
              setError(true);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={s.safe}><WellnessBackdrop variant="warm" />
      <ScrollView contentContainerStyle={s.container}>
        <ScreenHeader navigation={navigation} eyebrow="MY REMEMBERED TOPICS" title="Remembered Topics" subtitle="Topics you asked ElderMeds to remember for memory activities." />
        <InlineState loading={loading} error={error} onRetry={load} empty={!loading && !error && !topics.length} emptyTitle="No remembered topics yet" emptyText="When you share a memory and choose “Yes, remember this”, its topic will appear here." />
        {!loading && !error ? topics.map((topic) => (
          <Card key={topic.id} style={s.topicCard}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${prettyTopic(topic.topic_label || topic.topic_type)} prompt`} onPress={() => openTopic(topic)} style={({ pressed }) => [s.topicRow, pressed && s.pressed]}>
              <OrganicIcon color="#397668" soft="#EDF6F1" label="TOPIC" />
              <View style={s.topicCopy}>
                <Text style={s.topicTitle}>{prettyTopic(topic.topic_label || topic.topic_type)}</Text>
                {topic.safe_detail ? <Text numberOfLines={1} style={s.topicDetail}>About: {prettyTopic(topic.safe_detail)}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${prettyTopic(topic.topic_label || topic.topic_type)}`} onPress={() => confirmRemove(topic)} hitSlop={12} style={({ pressed }) => pressed && s.pressed}>
                <Text style={s.remove}>✕</Text>
              </Pressable>
            </Pressable>
          </Card>
        )) : null}
        {topics.length ? (
          <Button variant="secondary" label="Clear all remembered topics" onPress={confirmClearAll} style={s.clearButton} />
        ) : null}
        <Text style={s.note}>Only small topic labels are kept here — never your full words, photos, or private details.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { backgroundColor: '#FFF9F3', flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  topicCard: { marginBottom: spacing.md },
  topicRow: { alignItems: 'center', flexDirection: 'row' },
  topicCopy: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  topicTitle: { ...type.card, color: colors.text, fontSize: 19 },
  topicDetail: { ...type.meta, color: colors.secondary, marginTop: 2 },
  remove: { color: colors.error, fontSize: 22, fontWeight: '900', paddingHorizontal: spacing.sm },
  clearButton: { marginTop: spacing.lg },
  note: { ...type.meta, color: colors.secondary, marginTop: spacing.lg, textAlign: 'center' },
  pressed: { opacity: 0.82 },
});