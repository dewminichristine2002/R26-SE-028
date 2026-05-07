import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { createCheckIn } from '../api/emotionalSupportApi';
import ActionButton from '../components/ActionButton';
import MoodEmojiPicker from '../components/MoodEmojiPicker';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function MoodCheckInScreen({ navigation }) {
  const { elderId, setLastCheckIn } = useEmotionalSupportContext();
  const [selectedMood, setSelectedMood] = useState('neutral');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    try {
      setLoading(true);
      setError('');
      const { data } = await createCheckIn({
        elderId,
        checkInType: 'manual',
        inputMode: 'multimodal',
        emoji: selectedMood,
        text: message,
      });

      setLastCheckIn(data);
      navigation.navigate('AnalysisResult');
    } catch (submitError) {
      setError(submitError.response?.data?.error || 'Failed to submit emotional check-in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>How are you feeling today?</Text>
        <Text style={styles.subtitle}>
          Share a short message so ElderMeds can suggest gentle support and a memory activity.
        </Text>

        <MoodEmojiPicker value={selectedMood} onChange={setSelectedMood} />

        <TextInput
          multiline
          placeholder="Type how you are feeling..."
          style={styles.input}
          value={message}
          onChangeText={setMessage}
        />

        <StatusMessage error={error} />
        <ActionButton
          label={loading ? 'Submitting...' : 'Analyze and Continue'}
          onPress={handleSubmit}
          disabled={loading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F7FB' },
  container: { padding: 20, gap: 18 },
  title: { fontSize: 28, fontWeight: '700', color: '#243248' },
  subtitle: { fontSize: 15, lineHeight: 22, color: '#56647A' },
  input: {
    minHeight: 140,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CDD7E4',
    padding: 16,
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
  },
});
