import React, { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { startAdaptiveActivity, submitAdaptiveActivity } from '../api/emotionalSupportApi';

export default function CalmingActivityScreen({ navigation, route }) {
  const activity = route?.params?.recommended_activity || {};
  const context = route?.params?.activity_context || {};
  const [attempt, setAttempt] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleAction() {
    if (loading || result) return;
    try {
      setLoading(true);
      setError('');
      if (!attempt) setAttempt(await startAdaptiveActivity({ ...context, activity_code: activity.activity_code }));
      else setResult(await submitAdaptiveActivity(attempt.attempt_id, { user_id: context.user_id, response: {} }));
    } catch (requestError) {
      setError(requestError.message || 'We could not save this activity. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return <SafeAreaView style={styles.safeArea}><View style={styles.container}>
    <Text style={styles.title}>{activity.title || 'Gentle Pause'}</Text>
    <Text style={styles.description}>{activity.description || 'Take a short and comfortable pause.'}</Text>
    {!result ? <>
      <View style={styles.card}><Text style={styles.instructions}>{attempt ? activity.instructions : 'Press Start when you feel ready.'}</Text></View>
      <Pressable style={styles.button} onPress={handleAction} disabled={loading}>{loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{attempt ? 'Done' : 'Start'}</Text>}</Pressable>
    </> : <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>Activity completed</Text><Text style={styles.resultText}>{result.feedback}</Text>
      <Pressable style={styles.button} onPress={() => navigation.navigate('EmotionalTrendScreen')}><Text style={styles.buttonText}>View History</Text></Pressable>
      <Pressable style={styles.homeButton} onPress={() => navigation.popToTop()}><Text style={styles.homeButtonText}>Done</Text></Pressable>
    </View>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#EDF8FF', flex: 1 }, container: { flex: 1, padding: 26 }, title: { color: '#245B73', fontSize: 34, fontWeight: '900', lineHeight: 42 },
  description: { color: '#496A79', fontSize: 20, fontWeight: '700', lineHeight: 30, marginTop: 14 }, card: { backgroundColor: '#FFFFFF', borderRadius: 22, marginTop: 28, minHeight: 180, padding: 24 },
  instructions: { color: '#1F3744', fontSize: 24, fontWeight: '800', lineHeight: 38 }, button: { alignItems: 'center', backgroundColor: '#226C8C', borderRadius: 20, justifyContent: 'center', marginTop: 28, minHeight: 72 }, buttonText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  resultCard: { backgroundColor: '#FFF', borderRadius: 22, marginTop: 28, padding: 24 }, resultTitle: { color: '#245B73', fontSize: 28, fontWeight: '900' }, resultText: { color: '#496A79', fontSize: 19, fontWeight: '700', lineHeight: 29, marginTop: 12 },
  homeButton: { alignItems: 'center', borderColor: '#226C8C', borderRadius: 20, borderWidth: 2, justifyContent: 'center', marginTop: 14, minHeight: 68 }, homeButtonText: { color: '#226C8C', fontSize: 20, fontWeight: '900' }, error: { color: '#991B1B', fontSize: 17, fontWeight: '800', marginTop: 18 },
});
