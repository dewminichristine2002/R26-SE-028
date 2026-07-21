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
  onOpenDiabetesPrediction,
  onOpenStrokePrediction,
  onOpenHypertensionPrediction,
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

        {!loading && !error ? (
          <View style={styles.diabetesCard}>
            <View style={styles.diabetesHeaderRow}>
              <Text style={styles.diabetesIcon}>🩺</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.diabetesTitle}>Diabetes Risk Prediction</Text>
                <Text style={styles.diabetesSubtitle}>
                  Check possible diabetes risk using saved health and lifestyle values.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start diabetes risk check"
              onPress={onOpenDiabetesPrediction}
              style={({ pressed }) => [styles.diabetesButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.diabetesButtonText}>Start Diabetes Check</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error ? (
          <View style={styles.strokeCard}>
            <View style={styles.diabetesHeaderRow}>
              <Text style={styles.diabetesIcon}>🧠</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.strokeTitle}>Stroke Risk Prediction</Text>
                <Text style={styles.strokeSubtitle}>
                  Check possible stroke risk using BP, glucose, BMI, and history values.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start stroke risk check"
              onPress={onOpenStrokePrediction}
              style={({ pressed }) => [styles.strokeButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.diabetesButtonText}>Start Stroke Check</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error ? (
          <View style={styles.hypertensionCard}>
            <View style={styles.diabetesHeaderRow}>
              <Text style={styles.diabetesIcon}>❤️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.hypertensionTitle}>Hypertension Risk Prediction</Text>
                <Text style={styles.hypertensionSubtitle}>
                  Check possible high blood pressure risk using BP, BMI, glucose, and lifestyle values.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start hypertension risk check"
              onPress={onOpenHypertensionPrediction}
              style={({ pressed }) => [styles.hypertensionButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.diabetesButtonText}>Start BP Check</Text>
            </Pressable>
          </View>
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingTop: 30,
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginBottom: 4,
  },
  backButtonPressed: { opacity: 0.6 },
  backButtonText: { color: '#2563EB', fontWeight: '700', fontSize: 17 },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingEmoji: { fontSize: 32, marginRight: 10 },
  greeting: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 17,
    color: '#4B5563',
    marginTop: 2,
    lineHeight: 24,
  },
  scroll: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 140 },
  sectionHeading: {
    fontSize: 20,
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
    fontSize: 18,
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
  errorText: { color: '#991B1B', fontSize: 18, lineHeight: 27, fontWeight: '700' },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  retryButtonText: { color: '#991B1B', fontWeight: '900', fontSize: 17 },

  emptyBox: {
    paddingVertical: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 56, marginBottom: 10 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 27,
  },
  diabetesCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 8,
  },
  diabetesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  diabetesIcon: { fontSize: 28, marginRight: 10 },
  diabetesTitle: {
    color: '#065F46',
    fontWeight: '900',
    fontSize: 20,
    lineHeight: 26,
  },
  diabetesSubtitle: {
    color: '#047857',
    marginTop: 2,
    fontSize: 16,
    lineHeight: 23,
  },
  diabetesButton: {
    alignSelf: 'flex-start',
    minHeight: 54,
    backgroundColor: '#0F766E',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  diabetesButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  strokeCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginTop: 12,
  },
  strokeTitle: {
    color: '#5B21B6',
    fontWeight: '900',
    fontSize: 20,
    lineHeight: 26,
  },
  strokeSubtitle: {
    color: '#6D28D9',
    marginTop: 2,
    fontSize: 16,
    lineHeight: 23,
  },
  strokeButton: {
    alignSelf: 'flex-start',
    minHeight: 54,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  hypertensionCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 12,
  },
  hypertensionTitle: {
    color: '#991B1B',
    fontWeight: '900',
    fontSize: 20,
    lineHeight: 26,
  },
  hypertensionSubtitle: {
    color: '#B91C1C',
    marginTop: 2,
    fontSize: 16,
    lineHeight: 23,
  },
  hypertensionButton: {
    alignSelf: 'flex-start',
    minHeight: 54,
    backgroundColor: '#B91C1C',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  healthAdviceCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginTop: 12,
  },
  healthAdviceTitle: {
    color: '#064E3B',
    fontWeight: '900',
    fontSize: 20,
  },
  healthAdviceSubtitle: {
    color: '#047857',
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
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  healthAdviceChipText: {
    color: '#047857',
    fontWeight: '900',
    fontSize: 16,
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
    fontSize: 16,
    lineHeight: 24,
  },
});

export default UnifiedDashboardScreen;
