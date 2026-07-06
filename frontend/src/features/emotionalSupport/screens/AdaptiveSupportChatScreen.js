import React, { useEffect, useMemo, useState } from 'react';
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
import { respondAdaptiveChat, startAdaptiveChat } from '../api/emotionalSupportApi';

const DEMO_USER_ID = 1;
const TOTAL_QUESTIONS = 5;

function normalizeQuestion(question) {
  if (!question) {
    return null;
  }

  return {
    questionId: question.question_id ?? question.questionId,
    questionText: question.question_text ?? question.questionText ?? '',
    responseType: question.response_type ?? question.responseType ?? 'free_text',
  };
}

export default function AdaptiveSupportChatScreen({ navigation }) {
  const [sessionId, setSessionId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [questionIndex, setQuestionIndex] = useState(1);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

        const response = await startAdaptiveChat({ user_id: DEMO_USER_ID });
        const nextQuestion = normalizeQuestion(response.question);

        if (!nextQuestion?.questionText || !response.session_id) {
          throw new Error('We could not start the adaptive check-in right now.');
        }

        if (!isMounted) {
          return;
        }

        setSessionId(response.session_id);
        setCurrentQuestion(nextQuestion);
        setQuestionIndex(1);
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
  }, []);

  async function handleSendAnswer() {
    if (!canSend) {
      return;
    }

    try {
      setSending(true);
      setErrorMessage('');

      const answerText = currentAnswer.trim();
      const response = await respondAdaptiveChat({
        session_id: sessionId,
        user_id: DEMO_USER_ID,
        question_id: currentQuestion.questionId,
        answer_text: answerText,
      });

      const nextMessages = [
        ...messages,
        { id: `user-${questionIndex}`, actor: 'user', text: answerText },
      ];

      if (response.is_complete) {
        navigation.navigate('SupportResultScreen', {
          detected_emotional_state: response.final_emotional_state,
          confidence_score: response.confidence_score,
          risk_level: response.risk_level,
          cognitive_engagement_status: response.cognitive_engagement_status,
          caregiver_notification_required: response.caregiver_notification_required,
          support_directive: response.support_directive,
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
      setQuestionIndex((current) => current + 1);
    } catch (sendError) {
      setErrorMessage(sendError.message || 'We could not send your answer right now.');
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Adaptive Check-In</Text>
            <Text style={styles.subtitle}>
              Answer one small question at a time. The next question adapts to your answer.
            </Text>
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.progressText}>Question {Math.min(questionIndex, TOTAL_QUESTIONS)} of {TOTAL_QUESTIONS}</Text>
          </View>

          {messages.map((message) => {
            const isBot = message.actor === 'bot';

            return (
              <View key={message.id} style={[styles.messageRow, isBot ? styles.botRow : styles.userRow]}>
                <View style={[styles.bubble, isBot ? styles.botBubble : styles.userBubble]}>
                  <Text style={[styles.messageText, isBot ? styles.botText : styles.userText]}>
                    {message.text}
                  </Text>
                </View>
              </View>
            );
          })}

          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#2F6F62" />
              <Text style={styles.loadingText}>Loading your first adaptive question...</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Your answer</Text>
            <TextInput
              style={styles.input}
              value={currentAnswer}
              onChangeText={setCurrentAnswer}
              multiline
              editable={!loading && !sending}
              placeholder="Type your answer here..."
              placeholderTextColor="#7D8B8B"
              textAlignVertical="top"
            />
          </View>

          <Pressable
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={handleSendAnswer}
            disabled={!canSend}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Send Answer</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F8F5' },
  keyboardView: { flex: 1 },
  container: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 40 },
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
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E9E0',
    borderRadius: 22,
    borderWidth: 2,
    marginTop: 18,
    padding: 18,
  },
  inputLabel: { color: '#173E37', fontSize: 20, fontWeight: '900', marginBottom: 12 },
  input: {
    backgroundColor: '#F9FCFA',
    borderColor: '#D8E9E0',
    borderRadius: 18,
    borderWidth: 1,
    color: '#18332E',
    fontSize: 18,
    minHeight: 130,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  sendButton: {
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
