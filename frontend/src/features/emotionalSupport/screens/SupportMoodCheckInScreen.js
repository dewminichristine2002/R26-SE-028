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
import { Card, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { colors, screenInsets, spacing, type } from '../theme';

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
    <SafeAreaView style={styles.safeArea}><WellnessBackdrop />
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <ScreenHeader navigation={navigation} eyebrow="A MOMENT FOR YOU" title="Optional Mood Check-In" subtitle="You can save a quick mood note before adaptive chat." />

          <Card style={styles.moodGrid}>
            <Text style={styles.inputLabel}>How are you feeling today?</Text>
            {moodOptions.map((mood) => {
              const selected = selectedMood?.score === mood.score;

              return (
                <Pressable
                  key={mood.score}
                  style={({ pressed }) => [styles.moodButton, selected && styles.moodButtonSelected, pressed && styles.pressed]}
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
          </Card>

          <Card style={styles.reflectionCard}>
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
          </Card>

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
  safeArea: { flex: 1, backgroundColor: '#F7F8F5' },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  header: { marginBottom: 24 },
  moodGrid: { gap: spacing.sm, marginBottom: spacing.lg },
  moodButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1.5,
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  moodButtonSelected: { backgroundColor: '#E3F8EE', borderColor: '#275C4B' },
  moodLabel: { color: '#27231F', fontSize: 21, fontWeight: '900' },
  moodLabelSelected: { color: '#275C4B' },
  reflectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 24,
    padding: spacing.lg,
  },
  inputLabel: { ...type.card, color: '#27231F', fontSize: 20, marginBottom: spacing.md },
  reflectionInput: {
    backgroundColor: '#F7F8F5',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: '#27231F',
    fontSize: 18,
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  errorBox: {
    backgroundColor: '#FFF1F4',
    borderColor: '#F3A6A6',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  errorText: { color: '#991B1B', fontSize: 16, fontWeight: '700', lineHeight: 22 },
  successBox: {
    backgroundColor: '#E3F8EE',
    borderColor: '#8ED6A5',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  successText: { color: '#166534', fontSize: 17, fontWeight: '800', lineHeight: 23 },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#275C4B',
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
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
