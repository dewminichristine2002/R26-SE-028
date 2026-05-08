import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import SummaryCard from '../components/SummaryCard';
import AssistantFAB from '../components/AssistantFAB';
import { assistantService } from '../services/assistantService';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', emoji: '\u{1F305}' };
  if (hour < 17) return { text: 'Good afternoon', emoji: '\u2600\uFE0F' };
  if (hour < 21) return { text: 'Good evening', emoji: '\u{1F307}' };
  return { text: 'Good night', emoji: '\u{1F319}' };
};

const UnifiedDashboardScreen = ({ user, onBack, onOpenAssistant }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  const greeting = useMemo(getGreeting, []);
  const firstName = user?.fullName?.split(' ')[0] || '';

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await assistantService.getSummary();
      setSummary(data);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to load summary';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const askWithPrompt = useCallback(
    (prompt) => {
      if (typeof onOpenAssistant === 'function') {
        onOpenAssistant({ initialPrompt: prompt });
      } else {
        Alert.alert('Health Helper', `Would ask: ${prompt}`);
      }
    },
    [onOpenAssistant]
  );

  const cardCount = summary?.cards?.length || 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Text style={styles.backButtonText}>{'\u2190'}  Back</Text>
          </Pressable>
        ) : null}

        <View style={styles.greetingRow}>
          <Text style={styles.greetingEmoji}>{greeting.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {greeting.text}{firstName ? `, ${firstName}` : ''}
            </Text>
            <Text style={styles.subtitle}>Here is how you are doing today.</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Getting your health summary\u2026</Text>
          </View>
        ) : null}

        {!!error && !loading ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorEmoji}>{'\u26A0\uFE0F'}</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Try again"
              onPress={() => {
                setLoading(true);
                load();
              }}
              style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.retryButtonText}>{'\u21BB'}  Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error && cardCount > 0 ? (
          <>
            <Text style={styles.sectionHeading}>Your day at a glance</Text>
            {summary.cards.map((card) => (
              <SummaryCard key={card.id} card={card} onAskAssistant={askWithPrompt} />
            ))}
          </>
        ) : null}

        {!loading && !error && cardCount === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>{'\u{1F33F}'}</Text>
            <Text style={styles.emptyTitle}>Nothing to show yet</Text>
            <Text style={styles.emptyText}>
              Add a medicine or do a quick mood check-in, and your summary will appear here.
            </Text>
          </View>
        ) : null}

        {!loading && !error ? (
          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerIcon}>{'\u2139\uFE0F'}</Text>
            <Text style={styles.disclaimerText}>
              This summary uses your own health records. It is here to help you,
              but it is not a replacement for your doctor.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <AssistantFAB
        onPress={() => askWithPrompt('Give me a short overall summary of how I am doing today.')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 18,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 6,
    marginBottom: 8,
  },
  backButtonPressed: { opacity: 0.6 },
  backButtonText: { color: '#2563EB', fontWeight: '700', fontSize: 17 },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingEmoji: { fontSize: 36, marginRight: 12 },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#4B5563',
    marginTop: 2,
    lineHeight: 22,
  },
  scroll: { padding: 18, paddingBottom: 140 },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  loadingBox: { paddingVertical: 80, alignItems: 'center' },
  loadingText: {
    marginTop: 14,
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '500',
  },
  errorBox: {
    padding: 18,
    backgroundColor: '#FEE2E2',
    borderRadius: 16,
    borderLeftWidth: 6,
    borderLeftColor: '#EF4444',
    alignItems: 'flex-start',
  },
  errorEmoji: { fontSize: 28, marginBottom: 6 },
  errorText: { color: '#991B1B', fontSize: 16, lineHeight: 24, fontWeight: '500' },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  retryButtonText: { color: '#991B1B', fontWeight: '800', fontSize: 15 },

  emptyBox: {
    paddingVertical: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 56, marginBottom: 10 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },

  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 22,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
  },
  disclaimerIcon: { fontSize: 20, marginRight: 10 },
  disclaimerText: {
    flex: 1,
    color: '#3730A3',
    fontSize: 14,
    lineHeight: 22,
  },
});

export default UnifiedDashboardScreen;
