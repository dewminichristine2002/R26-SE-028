import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { respondAdaptiveChat, startAdaptiveChat } from '../api/emotionalSupportApi';
import { ListenControl, VoiceAnswerControl, VoiceStatus } from '../components/VoiceControls';
import { Button, Card, Greeting, InlineState, Progress, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import useEnglishVoice from '../voice/useEnglishVoice';
import { colors, radius, screenInsets, spacing, type } from '../theme';
import { getPersonalizedGreeting } from '../utils/personalization';

const TOTAL_QUESTIONS = 5;

function normalizeQuestion(question) {
  if (!question) {
    return null;
  }

  const sourceReplies = question.quick_replies ?? question.quickReplies ?? [];
  return {
    questionId: question.question_id ?? question.questionId,
    questionText: question.question_text ?? question.questionText ?? '',
    responseType: question.response_type ?? question.responseType ?? 'free_text',
    quickReplies: Array.isArray(sourceReplies) ? sourceReplies.slice(0, 3).map((reply, index) => ({
      id: String(reply?.id || `reply_${index + 1}`),
      label: String(reply?.label || reply?.value || '').trim(),
      value: String(reply?.value || reply?.label || '').trim(),
    })).filter((reply) => reply.label && reply.value) : [],
  };
}

export default function AdaptiveSupportChatScreen({ navigation }) {
  const { elderId, user } = useEmotionalSupportContext();
  const [sessionId, setSessionId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [questionIndex, setQuestionIndex] = useState(1);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const { width } = useWindowDimensions();
  const questionMotion = useRef(new Animated.Value(0));
  const submissionLockRef = useRef(false);
  const spokenQuestionRef = useRef(null);
  const handleTranscript = useCallback((transcript) => {
    setCurrentAnswer(transcript);
    setVoiceTranscript(transcript);
  }, []);
  const voice = useEnglishVoice({ onTranscript: handleTranscript });
  const greeting = useMemo(() => getPersonalizedGreeting(user), [user]);
  const selectedQuickReplyId = useMemo(() => currentQuestion?.quickReplies?.find((reply) => reply.value === currentAnswer)?.id || null, [currentAnswer, currentQuestion]);

  const canSend = useMemo(
    () => currentAnswer.trim().length > 0 && !loading && !sending && Boolean(currentQuestion),
    [currentAnswer, loading, sending, currentQuestion]
  );

  useEffect(() => {
    let isMounted = true;

    async function initializeChat() {
      try {
        setLoading(true);
        setErrorMessage('');

        if (!elderId) throw new Error('Please sign in again to start a check-in.');
        const response = await startAdaptiveChat({ user_id: elderId });
        const nextQuestion = normalizeQuestion(response.question);

        if (!nextQuestion?.questionText || !response.session_id) {
          throw new Error('We could not start the adaptive check-in right now.');
        }

        if (!isMounted) {
          return;
        }

        setSessionId(response.session_id);
        setCurrentQuestion(nextQuestion);
        setQuestionIndex(Number(response.question_number) || 1);
        setMessages([{ id: 'bot-1', actor: 'bot', text: nextQuestion.questionText }]);
      } catch (startError) {
        if (isMounted) {
          setErrorMessage(startError.message || 'We could not start the adaptive check-in.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    initializeChat();

    return () => {
      isMounted = false;
    };
  }, [elderId]);

  useEffect(() => {
    const questionKey = currentQuestion?.questionId;
    if (!questionKey || !currentQuestion?.questionText || spokenQuestionRef.current === questionKey) return;
    spokenQuestionRef.current = questionKey;
    voice.speak(currentQuestion.questionText);
  }, [currentQuestion?.questionId, currentQuestion?.questionText, voice.speak]);

  useEffect(() => {
    if (!currentQuestion?.questionId) return;
    questionMotion.current.setValue(0);
    Animated.timing(questionMotion.current, { toValue: 1, duration: 230, useNativeDriver: true }).start();
  }, [currentQuestion?.questionId]);

  async function handleSendAnswer() {
    if (!canSend || submissionLockRef.current || voice.isListening) {
      return;
    }

    try {
      submissionLockRef.current = true;
      voice.stopAll();
      setSending(true);
      setErrorMessage('');

      const answerText = currentAnswer.trim();
      const response = await respondAdaptiveChat({
        session_id: sessionId,
        user_id: elderId,
        question_id: currentQuestion.questionId,
        answer_text: answerText,
      });

      const nextMessages = [
        ...messages,
        { id: `user-${questionIndex}`, actor: 'user', text: answerText },
      ];

      if (response.is_complete) {
        voice.stopAll();
        navigation.navigate('SupportResultScreen', {
          detected_emotional_state: response.final_emotional_state,
          support_directive: response.support_directive,
          recommended_activity: response.recommended_activity,
          activity_context: { user_id: elderId, session_id: response.session_id },
        });
        return;
      }

      const nextQuestion = normalizeQuestion(response.next_question);

      if (!nextQuestion?.questionText) {
        throw new Error('We could not load the next question.');
      }

      setMessages([
        ...nextMessages,
        { id: `bot-${questionIndex + 1}`, actor: 'bot', text: nextQuestion.questionText },
      ]);
      setCurrentQuestion(nextQuestion);
      setCurrentAnswer('');
      setVoiceTranscript('');
      setQuestionIndex(Number(response.question_number) || questionIndex + 1);
    } catch (sendError) {
      setErrorMessage(sendError.message || 'We could not send your answer right now.');
    } finally {
      setSending(false);
      submissionLockRef.current = false;
    }
  }

  function handleQuickReply(reply) {
    setCurrentAnswer(reply.value);
    setVoiceTranscript('');
  }

  return (
    <SafeAreaView style={styles.safeArea}><WellnessBackdrop />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Greeting text={greeting} /><ScreenHeader navigation={navigation} title="Adaptive Check-In" subtitle="One question at a time." />
          <Progress current={Math.min(questionIndex, TOTAL_QUESTIONS)} total={TOTAL_QUESTIONS} />
          {messages.filter((m) => m.actor === 'user').length ? <View style={styles.historyWrap}><Pressable onPress={() => setShowHistory((v) => !v)} style={styles.historyToggle}><Text style={styles.historyLabel}>{showHistory ? 'Hide previous answers' : 'View previous answers'}</Text><Text style={styles.historyArrow}>{showHistory ? '⌃' : '⌄'}</Text></Pressable>{showHistory ? messages.filter((m) => m.actor === 'user').map((m) => <View key={m.id} style={styles.previous}><Text style={styles.previousLabel}>Previous answer</Text><Text numberOfLines={3} style={styles.previousText}>{m.text}</Text></View>) : <View style={styles.previous}><Text style={styles.previousLabel}>Previous answer</Text><Text numberOfLines={1} style={styles.previousText}>{messages.filter((m) => m.actor === 'user').slice(-1)[0]?.text}</Text></View>}</View> : null}
          {!loading && currentQuestion ? <Animated.View style={{ opacity: questionMotion.current, transform: [{ translateY: questionMotion.current.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}><Card style={styles.questionCard}><View style={styles.questionAccent} /><View style={styles.questionTop}><View style={styles.questionMark}><Text style={styles.questionMarkText}>?</Text></View><Text style={styles.questionEyebrow}>CURRENT QUESTION</Text></View><Text style={styles.questionText}>{currentQuestion.questionText}</Text><ListenControl isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(currentQuestion.questionText)} /></Card></Animated.View> : null}
          {!loading && currentQuestion?.quickReplies?.length ? <View style={styles.quickSection}><Text style={styles.quickTitle}>Quick answers</Text>{currentQuestion.quickReplies.map((reply) => { const selected = reply.id === selectedQuickReplyId; return <Pressable key={reply.id} accessibilityRole="button" accessibilityLabel={`Quick answer: ${reply.label}`} accessibilityState={{ selected }} onPress={() => handleQuickReply(reply)} style={({ pressed }) => [styles.quickReply, selected && styles.quickReplySelected, pressed && styles.quickReplyPressed]}><Text style={[styles.quickReplyText, selected && styles.quickReplyTextSelected]}>{reply.label}</Text><View style={[styles.quickMark, selected && styles.quickMarkSelected]}>{selected ? <Text style={styles.quickMarkText}>OK</Text> : null}</View></Pressable>; })}<View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>or answer in your own words</Text><View style={styles.orLine} /></View></View> : !loading && currentQuestion ? <Text style={styles.ownWords}>Answer in your own words</Text> : null}

          {loading ? (
            <InlineState loading emptyText="Loading your next question…" />
          ) : null}

          {errorMessage ? (
            <InlineState error />
          ) : null}

          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Your answer</Text>
            <TextInput
              style={styles.input}
              value={currentAnswer}
              onChangeText={setCurrentAnswer}
              multiline
              editable={!loading && !sending}
              placeholder="Type your answer..."
              placeholderTextColor={colors.secondary}
              textAlignVertical="top"
            />
            <VoiceStatus audioState={voice.audioState} error={voice.voiceError} transcript={voiceTranscript} />
          </View>
          <View style={[styles.actionRow, width < 370 && styles.actionStack]}><VoiceAnswerControl compact audioState={voice.audioState} disabled={loading || sending} onStart={voice.startListening} onStop={() => voice.stopListening()} /><Button style={styles.continue} label="Continue" loading={sending} disabled={!canSend || voice.isListening} onPress={handleSendAnswer} /></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  header: { marginBottom: 18 },
  title: { color: '#173E37', fontSize: 34, fontWeight: '900', lineHeight: 42 },
  subtitle: { color: '#546B64', fontSize: 18, fontWeight: '700', lineHeight: 26, marginTop: 8 },
  progressCard: {
    alignSelf: 'flex-start',
    backgroundColor: '#E4F1EB',
    borderRadius: 999,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  progressText: { color: '#2F6F62', fontSize: 16, fontWeight: '900' },
  messageRow: { marginBottom: 12 },
  botRow: { alignItems: 'flex-start' },
  userRow: { alignItems: 'flex-end' },
  bubble: { borderRadius: 24, maxWidth: '92%', paddingHorizontal: 18, paddingVertical: 16 },
  botBubble: { backgroundColor: '#FFFFFF', borderColor: '#D8E9E0', borderWidth: 2 },
  userBubble: { backgroundColor: '#2F6F62' },
  messageText: { fontSize: 21, fontWeight: '800', lineHeight: 30 },
  botText: { color: '#18332E' },
  userText: { color: '#FFFFFF' },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E9E0',
    borderRadius: 20,
    borderWidth: 2,
    flexDirection: 'row',
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  loadingText: {
    color: '#4C625D',
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    marginLeft: 12,
  },
  errorBox: {
    backgroundColor: '#FDECEC',
    borderColor: '#F1B0B0',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  errorText: { color: '#9B1C1C', fontSize: 16, fontWeight: '700', lineHeight: 22 },
  questionCard: { marginTop: spacing.xl, overflow: 'hidden' }, questionAccent: { backgroundColor: colors.mint, borderRadius: 60, height: 120, position: 'absolute', right: -45, top: -55, width: 120 }, questionTop: { alignItems: 'center', flexDirection: 'row' }, questionMark: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 14, height: 28, justifyContent: 'center', marginRight: spacing.sm, width: 28 }, questionMarkText: { color: colors.primary, fontSize: 16, fontWeight: '900' }, questionEyebrow: { ...type.meta, color: colors.primary, letterSpacing: 1 }, questionText: { ...type.question, color: colors.text, marginTop: spacing.md }, historyWrap: { marginTop: spacing.lg }, historyToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 }, historyLabel: { ...type.meta, color: colors.primary, fontWeight: '900' }, historyArrow: { color: colors.primary, fontSize: 20 }, previous: { backgroundColor: colors.mint, borderRadius: radius.small, marginBottom: spacing.sm, padding: spacing.md }, previousLabel: { ...type.meta, color: colors.secondary }, previousText: { ...type.body, color: colors.text, marginTop: 2 }, inputCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E9E0',
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    padding: 18,
  },
  quickSection: { marginTop: spacing.xl }, quickTitle: { ...type.card, color: colors.text, marginBottom: spacing.sm }, quickReply: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, flexDirection: 'row', marginTop: spacing.sm, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }, quickReplySelected: { backgroundColor: colors.mint, borderColor: colors.primary, borderWidth: 1.5 }, quickReplyPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] }, quickReplyText: { ...type.body, color: colors.text, flex: 1, fontWeight: '800' }, quickReplyTextSelected: { color: colors.primary, fontWeight: '900' }, quickMark: { alignItems: 'center', borderColor: colors.border, borderRadius: 14, borderWidth: 1.5, height: 28, justifyContent: 'center', marginLeft: spacing.md, width: 28 }, quickMarkSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, quickMarkText: { color: colors.white, fontSize: 8, fontWeight: '900' }, orRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }, orLine: { backgroundColor: colors.border, flex: 1, height: 1 }, orText: { ...type.meta, color: colors.secondary, textAlign: 'center' }, ownWords: { ...type.card, color: colors.text, marginTop: spacing.xl },
  inputLabel: { color: '#173E37', fontSize: 20, fontWeight: '900', marginBottom: 12 },
  input: {
    backgroundColor: '#F9FCFA',
    borderColor: '#D8E9E0',
    borderRadius: 18,
    borderWidth: 1,
    color: '#18332E',
    fontSize: 18,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }, actionStack: { flexDirection: 'column' }, continue: { flex: 1 }, sendButton: {
    alignItems: 'center',
    backgroundColor: '#2F6F62',
    borderRadius: 20,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 74,
    paddingHorizontal: 18,
  },
  sendButtonDisabled: { backgroundColor: '#9ABAB1' },
  sendButtonText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
});
