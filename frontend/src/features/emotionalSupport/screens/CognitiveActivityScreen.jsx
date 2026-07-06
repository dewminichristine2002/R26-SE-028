import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { submitActivityAttempt } from '../api/emotionalSupportApi';
import ActionButton from '../components/ActionButton';
import ActivityCard from '../components/ActivityCard';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function CognitiveActivityScreen({ navigation }) {
  const { elderId, lastCheckIn, setLastActivityAttempt } = useEmotionalSupportContext();
  const [answerText, setAnswerText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!lastCheckIn?.activity?.id || !lastCheckIn?.sessionId) {
      return;
    }

    try {
      setLoading(true);
      setError('');
      const { data } = await submitActivityAttempt(lastCheckIn.activity.id, {
        elderId,
        sessionId: lastCheckIn.sessionId,
        answerText,
        selectedOption: null,
        score: 8,
        completionStatus: 'completed',
      });

      setLastActivityAttempt(data.attempt);
      navigation.navigate('SessionSummary');
    } catch (submitError) {
      setError(submitError.response?.data?.error || 'Failed to save activity attempt.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Cognitive activity</Text>
        <StatusMessage empty={!lastCheckIn} emptyText="Complete a check-in first to receive a cognitive activity." />

        {lastCheckIn?.activity ? (
          <>
            <ActivityCard
              title={lastCheckIn.activity.title}
              type={lastCheckIn.activity.type}
              prompt={lastCheckIn.activity.prompt}
            />
            <TextInput
              multiline
              placeholder="Type the elder's response here..."
              style={styles.input}
              value={answerText}
              onChangeText={setAnswerText}
            />
            <StatusMessage error={error} />
            <ActionButton
              label={loading ? 'Saving...' : 'Save Activity Result'}
              onPress={handleSubmit}
              disabled={loading}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2FAF4' },
  container: { padding: 20, gap: 18 },
  title: { fontSize: 28, fontWeight: '700', color: '#1E3525' },
  input: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CFE0D0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    textAlignVertical: 'top',
  },
});
