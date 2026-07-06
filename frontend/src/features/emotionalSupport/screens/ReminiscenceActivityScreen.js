import React, { useState } from 'react';
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
import { processNarrative } from '../api/emotionalSupportApi';

const DEMO_USER_ID = 1;
const DEMO_PROMPT_ID = 1;

export default function ReminiscenceActivityScreen({ navigation }) {
  const [transcribedNarrative, setTranscribedNarrative] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = transcribedNarrative.trim().length > 0 && !loading;

  function handleVoicePlaceholder() {
    setVoiceNotice('Voice recording will be added later. For now, please type your memory below.');
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      const result = await processNarrative({
        user_id: DEMO_USER_ID,
        prompt_id: DEMO_PROMPT_ID,
        transcribed_narrative: transcribedNarrative.trim(),
      });

      navigation.navigate('SupportResultScreen', {
        detected_emotional_state: result.detected_emotional_state,
        confidence_score: result.confidence_score,
        risk_level: result.risk_level,
        caregiver_notification_required: result.caregiver_notification_required,
        support_directive: result.support_directive,
      });
    } catch (error) {
      setErrorMessage(error.message || 'We could not analyze your memory right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Memory Activity</Text>
            <Text style={styles.subtitle}>Share a familiar memory in your own words.</Text>
          </View>

          <View style={styles.promptCard}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>~</Text>
            </View>
            <View style={styles.promptCopy}>
              <Text style={styles.promptTitle}>Childhood Songs</Text>
              <Text style={styles.promptText}>Tell me about a song you liked when you were young.</Text>
            </View>
          </View>

          <Pressable style={styles.voiceButton} onPress={handleVoicePlaceholder}>
            <Text style={styles.voiceButtonText}>Hold & Speak</Text>
          </Pressable>

          {voiceNotice ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{voiceNotice}</Text>
            </View>
          ) : null}

          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Type your memory here</Text>
            <TextInput
              style={styles.memoryInput}
              value={transcribedNarrative}
              onChangeText={setTranscribedNarrative}
              multiline
              textAlignVertical="top"
              placeholder="For example, I remember a song my family played at home..."
              placeholderTextColor="#7A8B9A"
              editable={!loading}
            />
          </View>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
            {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.submitButtonText}>Analyze My Memory</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8EF' },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 40 },
  header: { marginBottom: 22 },
  title: { color: '#263D2B', fontSize: 34, fontWeight: '900', lineHeight: 42 },
  subtitle: { color: '#60735F', fontSize: 19, fontWeight: '700', lineHeight: 28, marginTop: 8 },
  promptCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE9CF',
    borderRadius: 22,
    borderWidth: 2,
    flexDirection: 'row',
    padding: 18,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: '#F5D889',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    marginRight: 16,
    width: 64,
  },
  iconText: { color: '#5B4307', fontSize: 34, fontWeight: '900' },
  promptCopy: { flex: 1 },
  promptTitle: { color: '#243B2A', fontSize: 24, fontWeight: '900', marginBottom: 8 },
  promptText: { color: '#506652', fontSize: 18, fontWeight: '600', lineHeight: 27 },
  voiceButton: {
    alignItems: 'center',
    backgroundColor: '#236F60',
    borderRadius: 20,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 80,
    paddingHorizontal: 18,
  },
  voiceButtonText: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  noticeBox: {
    backgroundColor: '#E7F4FC',
    borderColor: '#99CDE8',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  noticeText: { color: '#075985', fontSize: 17, fontWeight: '800', lineHeight: 24 },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DDE9CF',
    borderRadius: 22,
    borderWidth: 2,
    marginTop: 22,
    padding: 18,
  },
  inputLabel: { color: '#243B2A', fontSize: 21, fontWeight: '900', marginBottom: 12 },
  memoryInput: {
    backgroundColor: '#FCFDF9',
    borderColor: '#DDE9CF',
    borderRadius: 16,
    borderWidth: 1,
    color: '#243B2A',
    fontSize: 18,
    minHeight: 170,
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
  errorText: { color: '#991B1B', fontSize: 16, fontWeight: '800', lineHeight: 23 },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#236F60',
    borderRadius: 20,
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 72,
    paddingHorizontal: 18,
  },
  submitButtonDisabled: { backgroundColor: '#92AAA3' },
  submitButtonText: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
});
