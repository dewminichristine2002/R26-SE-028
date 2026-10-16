import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { listMemoryEntries } from '../api/emotionalSupportApi';
import { ListenControl, VoiceAnswerControl, VoiceStatus } from '../components/VoiceControls';
import { Button, Card, InlineState, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import useEnglishVoice from '../voice/useEnglishVoice';
import { colors, radius, screenInsets, spacing, type } from '../theme';
import PrivateMemoryPhoto from '../components/PrivateMemoryPhoto';

const FOLLOW_UPS = [
  'What part of this moment would you like to talk about?',
  'Is there a small detail about it that feels meaningful to you?',
  'Would you like to share anything else, or finish here?',
  'Thank you for sharing. Would you like to finish or choose another saved moment?',
];
const formatMemoryDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function MemoryConversationScreen({ navigation, route }) {
  const { elderId } = useEmotionalSupportContext();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [answer, setAnswer] = useState('');
  const [transcript, setTranscript] = useState('');
  const [turn, setTurn] = useState(0);

  const load = useCallback(async () => {
    if (!elderId) { setLoading(false); setError(true); return; }
    try {
      setLoading(true);
      setError(false);
      const result = await listMemoryEntries(elderId);
      const match = (result?.entries || []).find((item) => String(item.id) === String(route?.params?.entryId) && ['life_book', 'good_deed'].includes(item.entryType));
      setEntry(match || null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [elderId, route?.params?.entryId]);
  useEffect(() => { load(); }, [load]);

  const handleTranscript = useCallback((text) => { setAnswer(text); setTranscript(text); }, []);
  const voice = useEnglishVoice({ onTranscript: handleTranscript });
  const prompt = useMemo(() => FOLLOW_UPS[Math.min(turn, FOLLOW_UPS.length - 1)], [turn]);
  useEffect(() => () => voice.stopAll(), [voice.stopAll]);

  function submitResponse() {
    voice.stopAll();
    setAnswer('');
    setTranscript('');
    setTurn((current) => Math.min(current + 1, FOLLOW_UPS.length - 1));
  }

  const finish = () => { voice.stopAll(); setFinished(true); };
  const chooseAnother = () => navigation.navigate('RevisitMemoriesScreen');

  return <SafeAreaView style={s.safe}><WellnessBackdrop variant="warm" />
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <ScreenHeader navigation={navigation} eyebrow="A GENTLE REVISIT" title={finished ? 'Thank you for this moment' : 'A moment at your pace'} subtitle={finished ? 'You can return whenever you wish.' : 'You can listen, share a little, skip, or finish at any time.'} />
        <InlineState loading={loading} error={error} onRetry={load} empty={!loading && !error && !entry} emptyTitle="This saved moment is unavailable" emptyText="It may have been removed. You can choose another saved moment." />
        {!loading && !error && entry && !finished ? <>
          <Card style={s.groundingCard}>
            <View style={s.conversationIntro}><View style={s.memoryMark}><Text style={s.memoryMarkText}>♡</Text></View><View style={s.conversationCopy}><Text style={s.label}>A moment you chose to save</Text><Text style={s.conversationHint}>No pressure to remember or discuss anything.</Text></View></View>
            {!revealed ? <>
              <Text style={s.teaser}>Would you like a gentle reminder of this saved story?</Text>
              <Button label="Remind me" onPress={() => setRevealed(true)} style={s.fullButton} />
              <Button variant="secondary" label="Not now" onPress={finish} style={s.fullButton} />
            </> : <>
              {entry.photoUrl || entry.photoUnavailable ? <PrivateMemoryPhoto entryId={entry.id} userId={elderId} photoUrl={entry.photoUrl} style={s.photo} /> : null}
              <Text style={s.savedTitle}>{entry.title}</Text>
              {entry.category ? <Text style={s.meta}>{entry.category}</Text> : null}
              {entry.memoryDate ? <Text style={s.meta}>{formatMemoryDate(entry.memoryDate)}</Text> : null}
              <View style={s.savedStoryCard}><Text style={s.storyEyebrow}>YOUR SAVED WORDS</Text><Text style={s.savedStory}>{entry.story || 'You saved this title without a written description.'}</Text></View>
              <ListenControl disabled={!voice.speechAvailable} isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(entry.story || entry.title)} />
              <Text style={s.sourceNote}>This is the wording you chose to save. It is not independently verified, and you do not need to remember it.</Text>
            </>}
          </Card>
          {revealed ? <>
            <Card style={s.promptCard}>
              <View style={s.progressRow}><Text style={s.promptEyebrow}>IF YOU WOULD LIKE TO SHARE</Text><Text style={s.progressText}>Moment {turn + 1} of {FOLLOW_UPS.length}</Text></View>
              <Text style={s.prompt}>{prompt}</Text>
              <ListenControl isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(prompt)} />
            </Card>
            <Card style={s.answerCard}>
              <TextInput accessibilityLabel="Your optional response" style={s.input} value={answer} onChangeText={setAnswer} multiline textAlignVertical="top" placeholder="Share a little, or leave this blank..." placeholderTextColor={colors.secondary} />
              <VoiceStatus audioState={voice.audioState} error={voice.voiceError} transcript={transcript} />
              <View style={s.actionsRow}>
                <VoiceAnswerControl compact audioState={voice.audioState} onStart={voice.startListening} onStop={voice.stopListening} />
                <Button label="Continue" disabled={!answer.trim() || voice.isListening} onPress={submitResponse} style={s.continueButton} />
              </View>
            </Card>
            <View style={s.flexRow}>
              <Button variant="secondary" label="Change topic" onPress={() => navigation.navigate('MemoryMomentScreen')} style={s.halfButton} />
              <Button variant="secondary" label="Skip this prompt" accessibilityLabel="I don't remember; skip this prompt" onPress={() => { setAnswer(''); setTranscript(''); setTurn((current) => Math.min(current + 1, FOLLOW_UPS.length - 1)); }} style={s.halfButton} />
            </View>
            <Pressable accessibilityRole="button" onPress={finish} style={s.quietAction}><Text style={s.quietActionText}>Finish for now</Text></Pressable>
          </> : null}
        </> : null}
        {finished ? <Card style={s.doneCard}>
          <View style={s.completionMark}><Text style={s.completionMarkText}>♡</Text></View>
          <Text style={s.doneTitle}>Thank you for taking a moment.</Text>
          <Text style={s.doneText}>There is no score or assessment. You may leave this here or choose another saved story.</Text>
          <Button label="Revisit another memory" onPress={chooseAnother} style={s.fullButton} />
          <Button variant="secondary" label="Return to Memory Corner" onPress={() => navigation.navigate('ReminiscenceHubScreen')} style={s.fullButton} />
          <Button variant="secondary" label="Return Home" onPress={() => navigation.popToTop()} style={s.fullButton} />
        </Card> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 }, flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  groundingCard: { backgroundColor: colors.surface, borderColor: '#E9DCCB', borderTopColor: '#98566C', borderTopWidth: 4 },
  conversationIntro: { alignItems: 'center', flexDirection: 'row' },
  memoryMark: { alignItems: 'center', backgroundColor: '#F8EDEF', borderRadius: 18, height: 52, justifyContent: 'center', width: 52 },
  memoryMarkText: { color: '#98566C', fontSize: 26, fontWeight: '900' },
  conversationCopy: { flex: 1, marginLeft: spacing.md },
  label: { ...type.meta, color: '#75404F', fontWeight: '900', textTransform: 'uppercase' },
  conversationHint: { ...type.meta, color: colors.secondary, marginTop: 3 },
  teaser: { ...type.question, color: colors.text, marginTop: spacing.md },
  savedTitle: { ...type.section, color: colors.text, marginTop: spacing.sm },
  meta: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  savedStory: { ...type.body, color: colors.text, marginTop: spacing.md },
  photo: { borderRadius: radius.card, height: 230, marginTop: spacing.md, width: '100%' },
  savedStoryCard: { backgroundColor: '#FBF5F0', borderColor: '#EDE0D7', borderRadius: 18, borderWidth: 1, marginTop: spacing.md, padding: spacing.md },
  storyEyebrow: { ...type.meta, color: '#98566C', letterSpacing: 0.7 },
  sourceNote: { ...type.meta, color: colors.secondary, marginTop: spacing.md },
  promptCard: { marginTop: spacing.lg, backgroundColor: '#F4EEF7', borderColor: '#E2D8E9' },
  progressRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  promptEyebrow: { ...type.meta, color: colors.primary, fontWeight: '900', letterSpacing: 0.7 },
  progressText: { ...type.meta, color: '#765692', fontWeight: '900' },
  prompt: { ...type.question, color: colors.text, marginTop: spacing.md },
  answerCard: { marginTop: spacing.lg },
  input: { ...type.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, color: colors.text, marginTop: spacing.md, minHeight: 100, padding: spacing.md },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  continueButton: { flex: 1 }, flexRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  halfButton: { flex: 1 }, fullButton: { alignSelf: 'stretch', marginTop: spacing.md },
  quietAction: { alignSelf: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.lg },
  quietActionText: { ...type.meta, color: colors.secondary, textDecorationLine: 'underline' },
  doneCard: { alignItems: 'stretch', backgroundColor: '#FFFEFC', borderColor: '#E9DCCB' },
  completionMark: { alignSelf: 'center', alignItems: 'center', backgroundColor: '#F8EDEF', borderRadius: 34, height: 68, justifyContent: 'center', marginBottom: spacing.md, width: 68 },
  completionMarkText: { color: '#98566C', fontSize: 34 },
  doneTitle: { ...type.section, color: colors.text, textAlign: 'center' },
  doneText: { ...type.body, color: colors.secondary, marginTop: spacing.sm, textAlign: 'center' },
});
