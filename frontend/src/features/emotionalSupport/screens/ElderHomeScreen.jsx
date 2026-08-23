import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getWellnessSummary } from '../api/emotionalSupportApi';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

const menuCards = [
  {
    icon: '?',
    title: 'Start Adaptive Check-In',
    description: 'Dynamic questions based on how you feel',
    route: 'AdaptiveSupportChatScreen',
  },
  {
    icon: '#',
    title: 'View Mood & Emotion History',
    description: 'Review mood, emotion, and support trends',
    route: 'EmotionalTrendScreen',
  },
];

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
        if (!elderId) throw new Error('Please sign in again.');
        const data = await getWellnessSummary(elderId, '7d');

        if (active) {
          setSummary(data);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'We could not load your wellness summary. Please try again.');
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
        <View style={styles.headerSection}>
          <Text style={styles.title}>Emotional & Cognitive Support</Text>
          <Text style={styles.description}>
            Start an adaptive check-in, share memories, and review emotional trends.
          </Text>
        </View>

        <StatusMessage loading={loading} error={error} empty={!summary} emptyText="No trend summary available yet." />

        <View style={styles.cardContainer}>
          {menuCards.map((card, index) => (
            <React.Fragment key={card.route}>
              <View style={[styles.actionCard, index === 0 && styles.primaryCard]}>
                <View style={[styles.iconBox, index === 0 && styles.primaryIconBox]}>
                  <Text style={styles.cardIcon}>{card.icon}</Text>
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                </View>
                <Pressable style={styles.cardArrow} onPress={() => navigation.navigate(card.route)}>
                  <Text style={styles.arrowIcon}>{'\u203A'}</Text>
                </Pressable>
              </View>

              {index === 0 ? (
                <Text style={styles.noteText}>
                  This check-in uses adaptive questions and is not a medical diagnosis.
                </Text>
              ) : null}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#E0F4FF' },
  container: { paddingHorizontal: 20, paddingVertical: 24, gap: 24, paddingBottom: 40 },
  headerSection: { marginTop: 12, marginBottom: 8 },
  title: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '900',
    color: '#0D3D56',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4B7A95',
    fontWeight: '600',
  },
  cardContainer: { gap: 14 },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#C7E8F7',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#1E5A7E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryCard: {
    borderColor: '#7DD3C0',
  },
  iconBox: {
    backgroundColor: '#1E5A7E',
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIconBox: {
    backgroundColor: '#0F766E',
  },
  cardIcon: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#0D3D56',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#557282',
    fontWeight: '600',
  },
  cardArrow: {
    backgroundColor: '#E0F4FF',
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowIcon: {
    fontSize: 24,
    color: '#1E5A7E',
    fontWeight: '900',
  },
  noteText: {
    color: '#557282',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    paddingHorizontal: 4,
  },
});
