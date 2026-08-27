import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { createMoodCheckin } from '../api/emotionalSupportApi';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

const moodOptions = [
  { label: 'Terrible', score: 1 },
  { label: 'Bad', score: 2 },
  { label: 'Okay', score: 3 },
  { label: 'Good', score: 4 },
  { label: 'Great', score: 5 },
];

export default function SupportMoodCheckInScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [selectedMood, setSelectedMood] = useState(null);
  const [reflectionText, setReflectionText] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = useMemo(() => Boolean(elderId && selectedMood) && !loading, [elderId, selectedMood, loading]);

  async function handleSubmit() {
    if (!selectedMood || loading) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');

      await createMoodCheckin({
        user_id: elderId,
        mood_label: selectedMood.label,
        mood_score: selectedMood.score,
        reflection_text: reflectionText.trim(),
        input_mode: 'manual',
      });

      setSuccessMessage('Your mood check-in has been saved. Thank you for sharing today.');
    } catch (error) {
      setErrorMessage(error.message || 'We could not save your check-in right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    navigation.navigate('AdaptiveSupportChatScreen');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Optional Mood Check-In</Text>
            <Text style={styles.subtitle}>You can save a quick mood note before adaptive chat.</Text>
          </View>

          <View style={styles.moodGrid}>
            {moodOptions.map((mood) => {
              const selected = selectedMood?.score === mood.score;

              return (
                <Pressable
                  key={mood.score}
                  style={[styles.moodButton, selected && styles.moodButtonSelected]}
                  onPress={() => {
                    setSelectedMood(mood);
                    setSuccessMessage('');
                    setErrorMessage('');
                  }}
                >
                  <Text style={[styles.moodLabel, selected && styles.moodLabelSelected]}>{mood.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.reflectionCard}>
            <Text style={styles.inputLabel}>Short note</Text>
            <TextInput
              style={styles.reflectionInput}
              value={reflectionText}
              onChangeText={setReflectionText}
              multiline
              textAlignVertical="top"
              placeholder="You can type a few words here..."
              placeholderTextColor="#7A8B9A"
              editable={!loading}
            />
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {successMessage ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
            {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.submitButtonText}>Save Check-in</Text>}
          </Pressable>

          <Pressable style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueButtonText}>Continue to Adaptive Chat</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F1F8F5' },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { color: '#173D35', fontSize: 34, fontWeight: '900', lineHeight: 42 },
  subtitle: { color: '#526963', fontSize: 18, fontWeight: '600', lineHeight: 27, marginTop: 10 },
  moodGrid: { gap: 14 },
  moodButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E8E0',
    borderRadius: 20,
    borderWidth: 2,
    minHeight: 70,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  moodButtonSelected: { backgroundColor: '#DFF4ED', borderColor: '#287260' },
  moodLabel: { color: '#1E4038', fontSize: 24, fontWeight: '900' },
  moodLabelSelected: { color: '#0F5D4D' },
  reflectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D5E8E0',
    borderRadius: 20,
    borderWidth: 2,
    marginTop: 24,
    padding: 18,
  },
  inputLabel: { color: '#163B35', fontSize: 20, fontWeight: '900', marginBottom: 12 },
  reflectionInput: {
    backgroundColor: '#FAFDFC',
    borderColor: '#DCEBE6',
    borderRadius: 16,
    borderWidth: 1,
    color: '#163B35',
    fontSize: 18,
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderColor: '#F3A6A6',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  errorText: { color: '#991B1B', fontSize: 16, fontWeight: '700', lineHeight: 22 },
  successBox: {
    backgroundColor: '#E4F8EA',
    borderColor: '#8ED6A5',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  successText: { color: '#166534', fontSize: 17, fontWeight: '800', lineHeight: 23 },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#236F60',
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 68,
    paddingHorizontal: 20,
  },
  submitButtonDisabled: { backgroundColor: '#9DB4AD' },
  submitButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#F5C96F',
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 66,
    paddingHorizontal: 20,
  },
  continueButtonText: { color: '#3B2A08', fontSize: 19, fontWeight: '900' },
});
