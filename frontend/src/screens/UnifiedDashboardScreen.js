import React, { useCallback, useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import SummaryCard from '../components/SummaryCard';
import HeaderAccountActions from '../components/HeaderAccountActions';
import { assistantService } from '../services/assistantService';

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
      <View style={styles.headerArea}>
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            >
              <Ionicons name="arrow-back" size={22} color="#275C4B" />
            </Pressable>
          ) : null}
          <View style={styles.headerCopy}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="pulse-outline" size={21} color="#F8D978" style={styles.headerPulse} />
              <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Health overview</Text>
            </View>
          </View>
          <HeaderAccountActions />
        </View>
        <Text style={styles.subtitle}>{dashboardSubtitle}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#168565" colors={['#168565']} />}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#275C4B" />
            <Text style={styles.loadingText}>Loading your health summary</Text>
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
              <SummaryCard
                key={card.id}
                card={card}
                onPress={() => askWithPrompt(
                  card.chatPrompt || `Please explain my ${String(card.title || 'health summary').toLowerCase()} and what I should do next.`
                )}
              />
            ))}
          </>
        ) : null}

        {!loading && !error && cardCount === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="document-text-outline" size={30} color="#275C4B" style={styles.emptyEmoji} />
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
              <Ionicons name="pulse-outline" size={25} color="#287CB4" />
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
  container: { flex: 1, backgroundColor: '#F2F7F3' },
  headerArea: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  header: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#275C4B',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#F4CF75',
    paddingHorizontal: 10,
    shadowColor: '#20382F',
    shadowOpacity: 0.17,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  backButton: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FFF4C6',
  },
  backButtonPressed: { opacity: 0.6 },
  headerCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  headerPulse: { marginRight: 7 },
  greeting: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#53645A',
    marginTop: 14,
    paddingHorizontal: 2,
    lineHeight: 23,
  },
  scroll: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '900',
    color: '#193D31',
    marginBottom: 12,
    marginTop: 4,
    letterSpacing: 0,
  },
  loadingBox: { paddingVertical: 80, alignItems: 'center' },
  loadingText: {
    marginTop: 14,
    color: '#53645A',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#a93447',
  },
  retryButtonText: { color: '#8a2636', fontWeight: '900', fontSize: 17 },

  emptyBox: {
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: '#F1F8FC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D3E7F2',
  },
  emptyEmoji: { fontSize: 56, marginBottom: 10 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#193D31',
    marginBottom: 8,
  },
  emptyText: {
    color: '#53645A',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 27,
  },
  quickCareCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#EBF5FB',
    borderWidth: 1,
    borderColor: '#CFE5F2',
    marginTop: 12,
    shadowColor: '#4D7995',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  quickCareIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#D9ECF8',
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
    color: '#193D31',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
  },
  quickCareSubtitle: {
    color: '#63736A',
    marginTop: 3,
    fontSize: 14,
    lineHeight: 20,
  },
  quickCareArrow: {
    color: '#287CB4',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
  },
  healthAdviceCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#EDF7F0',
    borderWidth: 1,
    borderColor: '#D3E9DA',
    marginTop: 12,
    shadowColor: '#598570',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  healthAdviceTitle: {
    color: '#193D31',
    fontWeight: '800',
    fontSize: 18,
  },
  healthAdviceSubtitle: {
    color: '#53645A',
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
    minHeight: 44,
    backgroundColor: '#FFFFFF',
    borderColor: '#D4E6DA',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  healthAdviceChipText: {
    color: '#275C4B',
    fontWeight: '800',
    fontSize: 14,
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
