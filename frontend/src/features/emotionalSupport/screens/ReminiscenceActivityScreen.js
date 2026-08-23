import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { startAdaptiveActivity, submitAdaptiveActivity } from '../api/emotionalSupportApi';

export default function ReminiscenceActivityScreen({ navigation, route }) {
  const activity = route?.params?.recommended_activity || {};
  const context = route?.params?.activity_context || {};
  const [memory, setMemory] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canComplete = Boolean(activity.activity_code && context.session_id && context.user_id && memory.trim()) && !loading && !result;

  async function complete() {
    if (!canComplete) return;
    try {
      setLoading(true);
      setError('');
      const attempt = await startAdaptiveActivity({ ...context, activity_code: activity.activity_code });
      const completed = await submitAdaptiveActivity(attempt.attempt_id, { user_id: context.user_id, response: { narrative: memory.trim() } });
      setResult(completed);
    } catch (requestError) {
      setError(requestError.message || 'We could not save this activity. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return <SafeAreaView style={styles.safeArea}><KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{activity.title || 'Memory Activity'}</Text>
    <Text style={styles.subtitle}>{activity.description || 'Take a moment with a familiar and comfortable memory.'}</Text>
    {!result ? <>
      <View style={styles.promptCard}><Text style={styles.promptTitle}>Your memory prompt</Text><Text style={styles.promptText}>{activity.instructions || 'Think of a familiar positive memory and describe what you remember.'}</Text></View>
      <Text style={styles.inputLabel}>Share as much or as little as feels comfortable</Text>
      <TextInput style={styles.input} value={memory} onChangeText={setMemory} editable={!loading} multiline textAlignVertical="top" placeholder="Type your memory here..." placeholderTextColor="#7A8B9A" />
      <Pressable style={[styles.button, !canComplete && styles.disabled]} onPress={complete} disabled={!canComplete}>{loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Complete Activity</Text>}</Pressable>
    </> : <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>Activity completed</Text><Text style={styles.resultText}>{result.feedback}</Text><Text style={styles.resultText}>Thank you for sharing your memory.</Text>
      <Pressable style={styles.button} onPress={() => navigation.navigate('EmotionalTrendScreen')}><Text style={styles.buttonText}>View History</Text></Pressable>
      <Pressable style={styles.homeButton} onPress={() => navigation.popToTop()}><Text style={styles.homeButtonText}>Done</Text></Pressable>
    </View>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F8EF' }, keyboardView: { flex: 1 }, container: { padding: 24, paddingBottom: 44 },
  title: { color: '#263D2B', fontSize: 34, fontWeight: '900', lineHeight: 42 }, subtitle: { color: '#60735F', fontSize: 19, fontWeight: '700', lineHeight: 28, marginTop: 8 },
  promptCard: { backgroundColor: '#FFF8D9', borderRadius: 22, marginTop: 24, padding: 22 }, promptTitle: { color: '#4A3A0B', fontSize: 19, fontWeight: '900' }, promptText: { color: '#4A4A35', fontSize: 21, fontWeight: '700', lineHeight: 31, marginTop: 10 },
  inputLabel: { color: '#243B2A', fontSize: 19, fontWeight: '900', marginTop: 24 }, input: { backgroundColor: '#FFF', borderColor: '#DDE9CF', borderRadius: 18, borderWidth: 2, color: '#243B2A', fontSize: 19, minHeight: 170, marginTop: 12, padding: 16 },
  button: { alignItems: 'center', backgroundColor: '#236F60', borderRadius: 20, justifyContent: 'center', marginTop: 24, minHeight: 72, paddingHorizontal: 18 }, disabled: { opacity: 0.5 }, buttonText: { color: '#FFF', fontSize: 21, fontWeight: '900' },
  resultCard: { backgroundColor: '#FFF', borderRadius: 22, marginTop: 26, padding: 24 }, resultTitle: { color: '#263D2B', fontSize: 28, fontWeight: '900' }, resultText: { color: '#4B6354', fontSize: 19, fontWeight: '700', lineHeight: 29, marginTop: 12 },
  homeButton: { alignItems: 'center', borderColor: '#236F60', borderRadius: 20, borderWidth: 2, justifyContent: 'center', marginTop: 14, minHeight: 68 }, homeButtonText: { color: '#236F60', fontSize: 20, fontWeight: '900' }, error: { color: '#991B1B', fontSize: 17, fontWeight: '800', marginTop: 18 },
});
