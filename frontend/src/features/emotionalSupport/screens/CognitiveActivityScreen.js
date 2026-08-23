import React, { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { startAdaptiveActivity, submitAdaptiveActivity } from '../api/emotionalSupportApi';

export default function CognitiveActivityScreen({ navigation, route }) {
  const activity = route?.params?.recommended_activity || {};
  const context = route?.params?.activity_context || {};
  const [attempt, setAttempt] = useState(null);
  const [selected, setSelected] = useState([]);
  const [studyComplete, setStudyComplete] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    try {
      setLoading(true); setError('');
      setAttempt(await startAdaptiveActivity({ ...context, activity_code: activity.activity_code }));
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  function choose(option) {
    if (attempt?.task?.kind === 'multi_recall') setSelected((values) => values.includes(option) ? values.filter((value) => value !== option) : [...values, option]);
    else setSelected([option]);
  }
  async function submit() {
    if (!selected.length || loading || result) return;
    try {
      setLoading(true); setError('');
      const response = attempt.task.kind === 'multi_recall' ? { selectedAnswers: selected } : { selectedAnswer: selected[0] };
      setResult(await submitAdaptiveActivity(attempt.attempt_id, { user_id: context.user_id, response }));
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }

  return <SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>{activity.title || 'Short Engagement Activity'}</Text>
    {!attempt ? <><Text style={styles.description}>{activity.description || 'This is a short activity to help you stay engaged.'}</Text><ActionButton label="Start" loading={loading} onPress={start} /></> : null}
    {attempt && !result ? <>
      {attempt.task.studyItems && !studyComplete ? <><View style={styles.studyCard}><Text style={styles.studyLabel}>Remember these items:</Text><Text style={styles.studyItems}>{attempt.task.studyItems.join('  •  ')}</Text></View><ActionButton label="I’m ready" onPress={() => setStudyComplete(true)} /></> : <>
        <Text style={styles.prompt}>{attempt.task.prompt}</Text>
        <Text style={styles.progress}>Choose {attempt.task.kind === 'multi_recall' ? 'all that you remember' : 'one answer'}</Text>
        {attempt.task.options.map((option) => <Pressable key={option} style={[styles.option, selected.includes(option) && styles.optionSelected]} onPress={() => choose(option)} disabled={loading}><Text style={styles.optionText}>{option}</Text></Pressable>)}
        <ActionButton label="Continue" loading={loading} disabled={!selected.length} onPress={submit} />
      </>}
    </> : null}
    {result ? <View style={styles.resultCard}><Text style={styles.resultTitle}>Activity completed</Text><Text style={styles.resultText}>{result.feedback}</Text><Text style={styles.resultText}>Activity accuracy: {Math.round(result.accuracy * 100)}%</Text><Text style={styles.resultText}>Time: {result.duration_seconds} seconds</Text><ActionButton label="View History" onPress={() => navigation.navigate('EmotionalTrendScreen')} /><ActionButton label="Done" onPress={() => navigation.popToTop()} /></View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </ScrollView></SafeAreaView>;
}

function ActionButton({ label, loading, disabled, onPress }) {
  return <Pressable style={[styles.button, disabled && styles.disabled]} onPress={onPress} disabled={disabled || loading}>{loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>{label}</Text>}</Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#F1F7F3', flex: 1 }, container: { padding: 26 }, title: { color: '#244C36', fontSize: 34, fontWeight: '900', lineHeight: 42 },
  description: { color: '#4B6354', fontSize: 20, fontWeight: '700', lineHeight: 30, marginTop: 14 }, prompt: { color: '#1F2937', fontSize: 26, fontWeight: '900', lineHeight: 38, marginTop: 26 }, progress: { color: '#52645A', fontSize: 18, fontWeight: '800', marginVertical: 14 },
  studyCard: { backgroundColor: '#FFF8D9', borderRadius: 20, marginTop: 24, padding: 22 }, studyLabel: { fontSize: 18, fontWeight: '800' }, studyItems: { fontSize: 23, fontWeight: '900', lineHeight: 34, marginTop: 10 },
  option: { backgroundColor: '#FFF', borderColor: '#BCD2C4', borderRadius: 18, borderWidth: 2, marginTop: 12, minHeight: 68, padding: 18 }, optionSelected: { backgroundColor: '#DDF1E2', borderColor: '#24704A' }, optionText: { color: '#1F2937', fontSize: 22, fontWeight: '800' },
  button: { alignItems: 'center', backgroundColor: '#24704A', borderRadius: 20, justifyContent: 'center', marginTop: 26, minHeight: 72 }, disabled: { opacity: 0.5 }, buttonText: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  resultCard: { backgroundColor: '#FFF', borderRadius: 22, marginTop: 28, padding: 24 }, resultTitle: { color: '#244C36', fontSize: 28, fontWeight: '900' }, resultText: { color: '#374151', fontSize: 20, fontWeight: '700', lineHeight: 30, marginTop: 12 }, error: { color: '#991B1B', fontSize: 18, fontWeight: '800', marginTop: 18 },
});
