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
import { assistantService } from '../services/assistantService';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', emoji: '\u{1F305}' };
  if (hour < 17) return { text: 'Good afternoon', emoji: '\u2600\uFE0F' };
  if (hour < 21) return { text: 'Good evening', emoji: '\u{1F307}' };
  return { text: 'Good night', emoji: '\u{1F319}' };
};

const UnifiedDashboardScreen = ({
  user,
  onBack,
  onOpenAssistant,
  onOpenQuickCare,
}) => {
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
  const isCaregiver = user?.role === 'caregiver';
  const subjectName = firstName || (isCaregiver ? 'your elder' : 'you');
  const dashboardSubtitle = isCaregiver
    ? `Here is how ${subjectName} is doing today.`
    : 'Here is how you are doing today.';
  const sectionHeading = isCaregiver ? 'Elder day at a glance' : 'Your day at a glance';
  const emptyText = isCaregiver
    ? "Once the elder logs medicines, stock, mood, or routine data, the caregiver summary will appear here."
    : 'Add a medicine or do a quick mood check-in, and your summary will appear here.';
  const advicePrompts = isCaregiver
    ? [
        'What should I monitor as a caregiver?',
        'Which risks need attention today?',
        'How can I help reduce this risk?',
      ]
    : [
        'How can I reduce this risk?',
        'Why is this risk high?',
        'What should my caregiver monitor?',
      ];
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
            <Text style={styles.subtitle}>{dashboardSubtitle}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2f6654" />}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2f6654" />
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
            <Text style={styles.sectionHeading}>{sectionHeading}</Text>
            {summary.cards.map((card) => (
              <SummaryCard key={card.id} card={card} />
            ))}
          </>
        ) : null}

        {!loading && !error && cardCount === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>{'\u{1F33F}'}</Text>
            <Text style={styles.emptyTitle}>Nothing to show yet</Text>
            <Text style={styles.emptyText}>
              {emptyText}
            </Text>
          </View>
        ) : null}

        {!loading && !error && typeof onOpenQuickCare === 'function' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Quick Care"
            accessibilityHint="Opens risk prediction summary and checks"
            onPress={onOpenQuickCare}
            style={({ pressed }) => [styles.quickCareCard, pressed && { opacity: 0.86 }]}
          >
            <View style={styles.quickCareIconWrap}>
              <Text style={styles.quickCareIcon}>{'\u{1F49A}'}</Text>
            </View>
            <View style={styles.quickCareTextWrap}>
              <Text style={styles.quickCareTitle}>Quick Care</Text>
              <Text style={styles.quickCareSubtitle}>
                Open risk prediction summary and checks in one place.
              </Text>
            </View>
            <Text style={styles.quickCareArrow}>{'\u203A'}</Text>
          </Pressable>
        ) : null}

        {!loading && !error ? (
          <View style={styles.healthAdviceCard}>
            <Text style={styles.healthAdviceTitle}>Health risk advice</Text>
            <Text style={styles.healthAdviceSubtitle}>
              Ask for simple guidance from trusted health sources.
            </Text>
            <View style={styles.healthAdviceChipRow}>
              {advicePrompts.map((prompt) => (
                <Pressable
                  key={prompt}
                  accessibilityRole="button"
                  onPress={() => askWithPrompt(prompt)}
                  style={({ pressed }) => [styles.healthAdviceChip, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.healthAdviceChipText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {!loading && !error ? (
          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerIcon}>{'\u2139\uFE0F'}</Text>
            <Text style={styles.disclaimerText}>
              {isCaregiver ? "This summary uses the elder's health records." : 'This summary uses your own health records.'} It is here to help you,
              but it is not a replacement for your doctor.
            </Text>
          </View>
        ) : null}
      </ScrollView>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7efe4' },
  header: {
    paddingTop: 30,
    paddingHorizontal: 18,
    paddingBottom: 16,
    backgroundColor: '#f7efe4',
    borderBottomWidth: 1,
    borderBottomColor: '#eadfcd',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 12,
    borderRadius: 999,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#eadfcd',
  },
  backButtonPressed: { opacity: 0.6 },
  backButtonText: { color: '#2f6654', fontWeight: '900', fontSize: 17 },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 128,
    borderRadius: 22,
    backgroundColor: '#2f6654',
    borderWidth: 2,
    borderColor: '#e5c44f',
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#725e25',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  greetingEmoji: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: '#fff4b8',
    fontSize: 32,
    lineHeight: 66,
    marginRight: 14,
    textAlign: 'center',
    overflow: 'hidden',
  },
  greeting: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 17,
    color: '#ecfff6',
    marginTop: 4,
    lineHeight: 24,
    fontWeight: '700',
  },
  scroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 148 },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '900',
    color: '#27231f',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: 0,
  },
  loadingBox: { paddingVertical: 80, alignItems: 'center' },
  loadingText: {
    marginTop: 14,
    color: '#5e5143',
    fontSize: 18,
    fontWeight: '800',
  },
  errorBox: {
    padding: 18,
    backgroundColor: '#fff1f4',
    borderRadius: 16,
    borderLeftWidth: 6,
    borderLeftColor: '#a93447',
    alignItems: 'flex-start',
  },
  errorEmoji: { fontSize: 28, marginBottom: 6 },
  errorText: { color: '#8a2636', fontSize: 18, lineHeight: 27, fontWeight: '700' },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fffdf8',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#a93447',
  },
  retryButtonText: { color: '#8a2636', fontWeight: '900', fontSize: 17 },

  emptyBox: {
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: '#fffdf8',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadfcd',
  },
  emptyEmoji: { fontSize: 56, marginBottom: 10 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#27231f',
    marginBottom: 8,
  },
  emptyText: {
    color: '#5e5143',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 27,
  },
  quickCareCard: {
    minHeight: 106,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#eaf7ff',
    borderWidth: 1,
    borderColor: '#cae3f2',
    marginTop: 12,
    shadowColor: '#7a674f',
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  quickCareIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#a93447',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  quickCareIcon: {
    fontSize: 24,
    lineHeight: 30,
  },
  quickCareTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  quickCareTitle: {
    color: '#174862',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
  },
  quickCareSubtitle: {
    color: '#2576a6',
    marginTop: 3,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  quickCareArrow: {
    color: '#a93447',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
  },
  healthAdviceCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#b8ead6',
    marginTop: 12,
    shadowColor: '#7a674f',
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  healthAdviceTitle: {
    color: '#18352f',
    fontWeight: '900',
    fontSize: 20,
  },
  healthAdviceSubtitle: {
    color: '#2f6654',
    marginTop: 4,
    fontSize: 16,
    lineHeight: 23,
  },
  healthAdviceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  healthAdviceChip: {
    minHeight: 52,
    backgroundColor: '#e3f8ee',
    borderColor: '#b8ead6',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  healthAdviceChipText: {
    color: '#2f6654',
    fontWeight: '900',
    fontSize: 16,
  },

  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 22,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#fff7db',
    borderLeftWidth: 4,
    borderLeftColor: '#e5c44f',
  },
  disclaimerIcon: { fontSize: 20, marginRight: 10 },
  disclaimerText: {
    flex: 1,
    color: '#725319',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
  },
});

export default UnifiedDashboardScreen;
