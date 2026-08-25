import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
} from 'react-native';
import { respondAdaptiveChat, startAdaptiveChat } from '../api/emotionalSupportApi';
import { ListenControl } from '../components/VoiceControls';
import { Button, Card, InlineState, WellnessBackdrop } from '../components/WellnessUI';
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

/** Calm progress dots: ● ● ○ ○ ○ */
function ConversationDots({ current, total }) {
  return (
    <View accessibilityLabel={`Conversation moment ${current} of ${total}`} style={styles.dotsRow}>
      {Array.from({ length: total }).map((_, index) => (
        <View key={index} style={[styles.dot, index < current && styles.dotFilled]} />
      ))}
      <Text style={styles.dotsLabel}>{current} of {total}</Text>
    </View>
  );
}

/**
 * Elder-friendly voice feedback states. No technical wording such as STT
 * confidence or transcription engine is ever shown.
 */
function VoiceFeedback({ audioState, error, transcript, onUseAnswer, onTryAgain }) {
  if (error) {
    return (
      <View style={[styles.voicePanel, styles.voicePanelError]}>
        <Text style={styles.voicePanelTitle}>The microphone didn't work just now</Text>
        <Text style={styles.voicePanelHint}>You can try again, or type your answer instead.</Text>
        <Pressable accessibilityRole="button" onPress={onTryAgain} style={styles.voiceRetry}>
          <Text style={styles.voiceRetryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
  if (transcript) {
    return (
      <View style={styles.voicePanel}>
        <Text style={styles.voicePanelTitle}>I heard:</Text>
        <Text style={styles.transcript}>“{transcript}”</Text>
        <View style={styles.voiceActions}>
          <Pressable accessibilityRole="button" onPress={onUseAnswer} style={[styles.voiceAction, styles.voiceActionPrimary]}>
            <Text style={styles.voiceActionPrimaryText}>Use this answer</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (audioState === 'listening') {
    return (
      <View style={styles.voicePanel}>
        <ListeningPulse />
        <Text style={styles.voicePanelTitle}>Listening...</Text>
        <Text style={styles.voicePanelHint}>Speak when you are ready.</Text>
      </View>
    );
  }
  if (audioState === 'processing') {
    return (
      <View style={styles.voicePanel}>
        <Text style={styles.voicePanelTitle}>One moment...</Text>
        <Text style={styles.voicePanelHint}>Preparing your words.</Text>
      </View>
    );
  }
  return (
    <View style={styles.voicePanel}>
      <Text style={styles.voicePanelHint}>Ready to listen</Text>
    </View>
  );
}

function ListeningPulse() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.pulseWrap}>
      {[0, 1, 2].map((bar) => (
        <Animated.View key={bar} style={[styles.pulseBar, {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.25] }) }],
          animationDelayHint: bar,
        }]} />
      ))}
    </View>
  );
}

export default function AdaptiveSupportChatScreen({ navigation }) {
  const { elderId, user } = useEmotionalSupportContext();
  const [sessionId, setSessionId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [questionIndex, setQuestionIndex] = useState(1);
  // Current-turn focus: only the most recent answer + acknowledgement are
  // shown; older turns stay collapsed behind "View previous conversation".
  const [previousTurns, setPreviousTurns] = useState([]);
  const [lastAcknowledgement, setLastAcknowledgement] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [showTypeInput, setShowTypeInput] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const questionMotion = useRef(new Animated.Value(0));
  const submissionLockRef = useRef(false);
  const spokenQuestionRef = useRef(null);
  const greeting = useMemo(() => getPersonalizedGreeting(user), [user]);

  const handleTranscript = useCallback((transcript) => {
    // The recognized words populate the editable answer immediately, but are
    // never submitted without the elder pressing Continue.
    setCurrentAnswer(transcript);
    setVoiceTranscript(transcript);
  }, []);
  const voice = useEnglishVoice({ onTranscript: handleTranscript });

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
        setPreviousTurns([]);
        setLastAcknowledgement('');
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

  // Voice-first start: the system calmly reads the question aloud when each
  // new moment begins. The microphone NEVER starts automatically.
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

      if (response.is_complete) {
        voice.stopAll();
        navigation.navigate('SupportResultScreen', {
          detected_emotional_state: response.final_emotional_state,
          support_directive: response.support_directive,
          recommended_activity: response.recommended_activity,
          alternative_recommendation: response.alternative_recommendation || null,
          activity_context: { user_id: elderId, session_id: response.session_id },
        });
        return;
      }

      const nextQuestion = normalizeQuestion(response.next_question);

      if (!nextQuestion?.questionText) {
        throw new Error('We could not load the next question.');
      }

      setPreviousTurns((turns) => [...turns, {
        id: `turn-${questionIndex}`,
        questionText: currentQuestion.questionText,
        answer: answerText,
        acknowledgement: response.acknowledgement || '',
      }]);
      setLastAcknowledgement(response.acknowledgement || '');
      setCurrentQuestion(nextQuestion);
      setCurrentAnswer('');
      setVoiceTranscript('');
      setShowTypeInput(false);
      setQuestionIndex(Number(response.question_number) || questionIndex + 1);
    } catch (sendError) {
      setErrorMessage(sendError.message || 'We could not send your answer right now.');
    } finally {
      setSending(false);
      submissionLockRef.current = false;
    }
  }

  function handleQuickReply(reply) {
    voice.stopAll();
    setCurrentAnswer(reply.value);
    setVoiceTranscript('');
  }

  function useTranscriptAsAnswer() {
    setCurrentAnswer(voiceTranscript.trim());
    setVoiceTranscript('');
    voice.clearVoiceError();
  }

  function tryListeningAgain() {
    setCurrentAnswer('');
    setVoiceTranscript('');
    voice.clearVoiceError();
    voice.startListening();
  }

  const showQuickReplies = !loading && currentQuestion?.quickReplies?.length > 0 && !voiceTranscript;

  return (
    <SafeAreaView style={styles.safeArea}><WellnessBackdrop />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.conversationIntro}>Let's talk for a moment.</Text>
          <ConversationDots current={Math.min(questionIndex, TOTAL_QUESTIONS)} total={TOTAL_QUESTIONS} />

          {/* Collapsed previous conversation */}
          {previousTurns.length ? (
            <View style={styles.historyWrap}>
              <Pressable onPress={() => setShowHistory((value) => !value)} style={styles.historyToggle}>
                <Text style={styles.historyLabel}>{showHistory ? 'Hide previous conversation' : 'View previous conversation'}</Text>
                <Text style={styles.historyArrow}>{showHistory ? '⌃' : '⌄'}</Text>
              </Pressable>
              {showHistory ? previousTurns.map((turn) => (
                <View key={turn.id} style={styles.previousTurn}>
                  <Text numberOfLines={2} style={styles.previousQuestion}>{turn.questionText}</Text>
                  <Text numberOfLines={3} style={styles.previousAnswer}>You said: “{turn.answer}”</Text>
                  {turn.acknowledgement ? <Text style={styles.previousAck}>{turn.acknowledgement}</Text> : null}
                </View>
              )) : null}
            </View>
          ) : null}

          {/* Most recent answer + safe acknowledgement */}
          {lastAcknowledgement ? (
            <View style={styles.ackBlock}>
              <Text style={styles.youSaid}>You said:</Text>
              <Text style={styles.youSaidText}>“{previousTurns.at(-1)?.answer || ''}”</Text>
              <View style={styles.ackBubble}><Text style={styles.ackText}>{lastAcknowledgement}</Text></View>
            </View>
          ) : null}

          {/* Current question */}
          {!loading && currentQuestion ? (
            <Animated.View style={{ opacity: questionMotion.current, transform: [{ translateY: questionMotion.current.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
              <Card style={styles.questionCard}>
                <Text style={styles.questionText}>{currentQuestion.questionText}</Text>
                <ListenControl
                  isSpeaking={voice.isSpeaking}
                  onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(currentQuestion.questionText)}
                />
              </Card>
            </Animated.View>
          ) : null}

          {loading ? <InlineState loading emptyText="Getting our conversation ready…" /> : null}
          {errorMessage ? <InlineState error /> : null}

          {/* Primary answer action: large microphone */}
          {!loading && currentQuestion && !voiceTranscript ? (
            <View style={styles.primaryActionWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Speak Answer"
                accessibilityState={{ busy: voice.audioState === 'listening' }}
                disabled={loading || sending}
                onPress={() => voice.isListening ? voice.stopListening() : voice.startListening()}
                style={({ pressed }) => [styles.speakButton, pressed && styles.pressed]}
              >
                <View style={styles.speakMicWrap}>
                  <View style={styles.speakMicCapsule} />
                  <View style={styles.speakMicStem} />
                  <View style={styles.speakMicBase} />
                </View>
                <Text style={styles.speakButtonText}>{voice.isListening ? 'Tap to stop' : 'Speak Answer'}</Text>
              </Pressable>
              <VoiceFeedback
                audioState={voice.audioState}
                error={voice.voiceError}
                transcript=""
                onUseAnswer={() => {}}
                onTryAgain={() => {}}
              />
            </View>
          ) : null}

          {/* Transcript review — never auto-submitted */}
          {voiceTranscript ? (
            <View style={styles.reviewWrap}>
              <VoiceFeedback
                audioState={voice.audioState}
                error={voice.voiceError}
                transcript={voiceTranscript}
                onUseAnswer={useTranscriptAsAnswer}
                onTryAgain={tryListeningAgain}
              />
              <View style={styles.reviewActions}>
                <Button label="Use this answer" onPress={useTranscriptAsAnswer} style={styles.reviewPrimary} />
                <Button variant="secondary" label="Try again" onPress={tryListeningAgain} style={styles.reviewSecondary} />
              </View>
            </View>
          ) : null}

          {/* Quick answers */}
          {showQuickReplies ? (
            <View style={styles.quickSection}>
              <Text style={styles.quickTitle}>Quick answers</Text>
              {currentQuestion.quickReplies.map((reply) => {
                const selected = reply.value === currentAnswer;
                return (
                  <Pressable
                    key={reply.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Quick answer: ${reply.label}`}
                    accessibilityState={{ selected }}
                    onPress={() => handleQuickReply(reply)}
                    style={({ pressed }) => [styles.quickReply, selected && styles.quickReplySelected, pressed && styles.pressed]}
                  >
                    <Text style={[styles.quickReplyText, selected && styles.quickReplyTextSelected]}>{reply.label}</Text>
                    <View style={[styles.quickMark, selected && styles.quickMarkSelected]}>{selected ? <Text style={styles.quickMarkText}>OK</Text> : null}</View>
                  </Pressable>
                );
              })}
              <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>or</Text><View style={styles.orLine} /></View>
              <Pressable accessibilityRole="button" onPress={() => { setShowTypeInput(true); }} style={styles.typeInstead}>
                <Text style={styles.typeInsteadText}>or answer in your own words</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Typed answer fallback */}
          {!loading && currentQuestion && showTypeInput && !voiceTranscript ? (
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
            </View>
          ) : null}

          <Button
            label="Continue"
            loading={sending}
            disabled={!canSend || voice.isListening}
            onPress={handleSendAnswer}
            style={styles.continueButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  greeting: { ...type.section, color: colors.text },
  conversationIntro: { ...type.body, color: colors.secondary, marginTop: spacing.xs },
  dotsRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  dot: { backgroundColor: colors.border, borderRadius: 7, height: 14, width: 14 },
  dotFilled: { backgroundColor: colors.primary },
  dotsLabel: { ...type.meta, color: colors.secondary, marginLeft: spacing.sm },
  historyWrap: { marginTop: spacing.lg },
  historyToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  historyLabel: { ...type.meta, color: colors.primary, fontWeight: '900' },
  historyArrow: { color: colors.primary, fontSize: 20 },
  previousTurn: { backgroundColor: colors.mint, borderRadius: radius.small, marginBottom: spacing.sm, padding: spacing.md },
  previousQuestion: { ...type.meta, color: colors.secondary },
  previousAnswer: { ...type.body, color: colors.text, marginTop: 2 },
  previousAck: { ...type.meta, color: colors.secondary, fontStyle: 'italic', marginTop: 4 },
  ackBlock: { marginTop: spacing.lg },
  youSaid: { ...type.meta, color: colors.secondary },
  youSaidText: { ...type.body, color: colors.text, fontWeight: '800', marginTop: 2 },
  ackBubble: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderTopLeftRadius: 6, borderWidth: 1, marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  ackText: { ...type.body, color: colors.text, fontStyle: 'italic' },
  questionCard: { marginTop: spacing.lg, overflow: 'hidden' },
  questionText: { ...type.question, color: colors.text },
  primaryActionWrap: { marginTop: spacing.xl, alignItems: 'center' },
  speakButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.hero, justifyContent: 'center', minHeight: 96, width: '100%' },
  speakMicWrap: { alignItems: 'center', height: 34, justifyContent: 'center', marginBottom: spacing.sm, width: 34 },
  speakMicCapsule: { borderColor: colors.white, borderRadius: 10, borderWidth: 2.5, height: 20, width: 13 },
  speakMicStem: { backgroundColor: colors.white, height: 6, width: 2.5 },
  speakMicBase: { backgroundColor: colors.white, borderRadius: 2, height: 2.5, width: 16 },
  speakButtonText: { ...type.button, color: colors.white, fontSize: 21 },
  reviewWrap: { marginTop: spacing.lg },
  reviewActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  reviewPrimary: { flex: 1 },
  reviewSecondary: { flex: 1 },
  quickSection: { marginTop: spacing.xl },
  quickTitle: { ...type.card, color: colors.text, marginBottom: spacing.sm },
  quickReply: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, flexDirection: 'row', marginTop: spacing.sm, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  quickReplySelected: { backgroundColor: colors.mint, borderColor: colors.primary, borderWidth: 1.5 },
  quickReplyText: { ...type.body, color: colors.text, flex: 1, fontWeight: '800' },
  quickReplyTextSelected: { color: colors.primary, fontWeight: '900' },
  quickMark: { alignItems: 'center', borderColor: colors.border, borderRadius: 14, borderWidth: 1.5, height: 28, justifyContent: 'center', marginLeft: spacing.md, width: 28 },
  quickMarkSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  quickMarkText: { color: colors.white, fontSize: 8, fontWeight: '900' },
  orRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  orLine: { backgroundColor: colors.border, flex: 1, height: 1 },
  orText: { ...type.meta, color: colors.secondary, textAlign: 'center' },
  typeInstead: { alignItems: 'center', minHeight: 48, justifyContent: 'center', marginTop: spacing.xs },
  typeInsteadText: { ...type.body, color: colors.primary, fontWeight: '900' },
  inputCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, marginTop: spacing.lg, padding: spacing.lg },
  inputLabel: { ...type.card, color: colors.text, marginBottom: spacing.sm },
  input: { ...type.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.text, minHeight: 88, padding: spacing.md, textAlignVertical: 'top' },
  continueButton: { marginTop: spacing.xl },
  pulseWrap: { alignItems: 'flex-end', flexDirection: 'row', gap: 4, height: 22, marginBottom: spacing.sm },
  pulseBar: { backgroundColor: colors.primary, borderRadius: 3, height: 22, width: 5 },
  voicePanel: { alignItems: 'center', backgroundColor: colors.mint, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, marginTop: spacing.md, padding: spacing.lg, width: '100%' },
  voicePanelError: { backgroundColor: colors.errorBg },
  voicePanelTitle: { ...type.body, color: colors.text, fontWeight: '900', textAlign: 'center' },
  voicePanelHint: { ...type.meta, color: colors.secondary, marginTop: 2, textAlign: 'center' },
  transcript: { ...type.question, color: colors.text, fontSize: 21, lineHeight: 29, marginVertical: spacing.sm, textAlign: 'center' },
  voiceActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  voiceAction: { borderRadius: radius.button, minHeight: 50, justifyContent: 'center', paddingHorizontal: spacing.lg },
  voiceActionPrimary: { backgroundColor: colors.primary },
  voiceActionSecondary: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1.5 },
  voiceActionPrimaryText: { ...type.body, color: colors.white, fontWeight: '900' },
  voiceActionSecondaryText: { ...type.body, color: colors.primary, fontWeight: '900' },
  voiceRetry: { marginTop: spacing.sm, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  voiceRetryText: { ...type.meta, color: colors.primary, fontWeight: '900' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.988 }] },
});

export { VoiceFeedback };