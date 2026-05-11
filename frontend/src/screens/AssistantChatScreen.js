import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ChatBubble from '../components/ChatBubble';
import { assistantService } from '../services/assistantService';

let SpeechModule = null;
let SpeechRecognitionModule = null;
let ExpoEventEmitter = null;

try {
  SpeechModule = require('expo-speech');
} catch (error) {
  console.log('[AssistantChat] expo-speech unavailable:', error?.message || error);
}

try {
  SpeechRecognitionModule = require('expo-speech-recognition');
} catch (error) {
  console.log('[AssistantChat] expo-speech-recognition unavailable:', error?.message || error);
}

try {
  const expoModulesCore = require('expo-modules-core');
  ExpoEventEmitter = expoModulesCore.EventEmitter;
} catch (error) {
  console.log('[AssistantChat] expo-modules-core EventEmitter unavailable:', error?.message || error);
}

const SUGGESTED_PROMPTS = [
  'Check my diabetes risk.',
  'Now my weight is 60kg',
  'Check my stroke risk.',
  'Check my hypertension risk.',
  'How can I reduce this risk?',
  'Why is this risk high?',
  'What should my caregiver monitor?',
  'Did I miss any medicine this week?',
  'How has my mood been recently?',
  'Which medicines are running low?',
  'Are any of my saved medicines dangerous for me?',
  'Show my recent caregiver alerts.',
];

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatRelativeTime = (isoString) => {
  if (!isoString) {
    return '';
  }
  const ts = new Date(isoString).getTime();
  if (Number.isNaN(ts)) {
    return '';
  }
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
};

const getCompactPromptLabel = (prompt, maxLength = 44) => {
  const text = String(prompt || '').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const extractSourcesFromRows = (rows) => (Array.isArray(rows) ? rows : [])
  .map((row) => ({
    name: row.name || row.source_name || row.sourceName,
    url: row.url || row.source_url || row.sourceUrl,
  }))
  .filter((source) => source.name || source.url);

const mapServerMessageToBubble = (row) => ({
  id: `srv-${row.id}`,
  role: row.role || 'assistant',
  content: row.content || '',
  sql: row.sql_used || '',
  rows: Array.isArray(row.rows_returned) ? row.rows_returned : [],
  sources: extractSourcesFromRows(row.rows_returned),
  fallback: Boolean(row.fallback_reason),
  followUps: [],
});

const AssistantChatScreen = ({ initialPrompt, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(initialPrompt || '');
  const [conversationId, setConversationId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [loadingConversationId, setLoadingConversationId] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [followUpsCollapsed, setFollowUpsCollapsed] = useState(true);
  const scrollRef = useRef(null);
  const sentInitial = useRef(false);
  const finalTranscriptRef = useRef('');

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    }, 50);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (SpeechModule && SpeechModule.stop) {
      SpeechModule.stop();
    }
    setSpeakingId(null);
  }, []);

  const speakMessage = useCallback((message) => {
    if (!SpeechModule || !message?.content) {
      return;
    }
    if (speakingId === message.id) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    setSpeakingId(message.id);
    SpeechModule.speak(message.content, {
      language: 'en',
      pitch: 1.0,
      rate: 0.95,
      onDone: () => setSpeakingId(null),
      onStopped: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  }, [speakingId, stopSpeaking]);

  const openHistory = useCallback(async () => {
    setShowHistory(true);
    setHistoryError('');
    setLoadingHistory(true);
    try {
      const list = await assistantService.listConversations();
      setConversations(list || []);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to load history';
      setHistoryError(msg);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const closeHistory = useCallback(() => {
    setShowHistory(false);
    setHistoryError('');
  }, []);

  const startNewChat = useCallback(() => {
    stopSpeaking();
    setMessages([]);
    setInput('');
    setConversationId(null);
    setError('');
    setFollowUpsCollapsed(true);
    sentInitial.current = true;
    closeHistory();
  }, [closeHistory, stopSpeaking]);

  const selectConversation = useCallback(
    async (entry) => {
      if (!entry?.id) return;
      stopSpeaking();
      setLoadingConversationId(entry.id);
      setError('');
      try {
        const serverMessages = await assistantService.getConversationMessages(entry.id);
        const mapped = (serverMessages || []).map(mapServerMessageToBubble);
        setMessages(mapped);
        setConversationId(entry.id);
        setFollowUpsCollapsed(true);
        sentInitial.current = true;
        setShowHistory(false);
        setHistoryError('');
        scrollToBottom();
      } catch (err) {
        const msg = err.response?.data?.error || err.message || 'Failed to load conversation';
        setHistoryError(msg);
      } finally {
        setLoadingConversationId(null);
      }
    },
    [scrollToBottom, stopSpeaking]
  );

  const beginRename = useCallback((entry) => {
    if (!entry?.id) return;
    setRenameTarget(entry);
    setRenameValue(entry.title || '');
  }, []);

  const cancelRename = useCallback(() => {
    setRenameTarget(null);
    setRenameValue('');
    setRenameSaving(false);
  }, []);

  const confirmRename = useCallback(async () => {
    if (!renameTarget?.id) return;
    const trimmed = String(renameValue || '').trim();
    if (!trimmed) {
      Alert.alert('Title required', 'Please enter a title for the chat.');
      return;
    }
    setRenameSaving(true);
    try {
      const updated = await assistantService.renameConversation(renameTarget.id, trimmed);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === renameTarget.id
            ? { ...c, title: updated?.title || trimmed, updated_at: updated?.updated_at || c.updated_at }
            : c
        )
      );
      cancelRename();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to rename';
      Alert.alert('Could not rename', msg);
      setRenameSaving(false);
    }
  }, [cancelRename, renameTarget, renameValue]);

  const confirmDelete = useCallback(
    (entry) => {
      if (!entry?.id) return;
      Alert.alert(
        'Delete chat?',
        `This will permanently remove "${entry.title || 'this conversation'}" and all of its messages.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await assistantService.deleteConversation(entry.id);
                setConversations((prev) => prev.filter((c) => c.id !== entry.id));
                if (conversationId === entry.id) {
                  stopSpeaking();
                  setMessages([]);
                  setConversationId(null);
                  setInput('');
                }
              } catch (err) {
                const msg = err.response?.data?.error || err.message || 'Failed to delete';
                Alert.alert('Could not delete', msg);
              }
            },
          },
        ]
      );
    },
    [conversationId, stopSpeaking]
  );

  const showConversationActions = useCallback(
    (entry) => {
      if (!entry?.id) return;
      Alert.alert(
        entry.title || 'Conversation',
        'Choose an action for this chat.',
        [
          { text: 'Open', onPress: () => selectConversation(entry) },
          { text: 'Rename', onPress: () => beginRename(entry) },
          { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(entry) },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    },
    [beginRename, confirmDelete, selectConversation]
  );

  const sendMessage = useCallback(
    async (rawText) => {
      const text = String(rawText ?? '').trim();
      if (!text || sending) {
        return;
      }
      stopSpeaking();
      setError('');
      setSending(true);
      setFollowUpsCollapsed(true);

      const userBubble = {
        id: generateId(),
        role: 'user',
        content: text,
      };
      setMessages((prev) => [...prev, userBubble]);
      setInput('');
      scrollToBottom();

      try {
        const response = await assistantService.chat({
          message: text,
          conversationId,
        });

        if (response.conversationId && response.conversationId !== conversationId) {
          setConversationId(response.conversationId);
        }

        const assistantBubble = {
          id: generateId(),
          role: 'assistant',
          content: response.answer || '',
          sql: response.sql || '',
          rows: Array.isArray(response.rows) ? response.rows : [],
          sources: Array.isArray(response.sources) ? response.sources : extractSourcesFromRows(response.rows),
          safetyNote: response.safetyNote || '',
          fallback: Boolean(response.fallback),
          followUps: Array.isArray(response.followUps) ? response.followUps : [],
        };
        if (assistantBubble.followUps.length) {
          setFollowUpsCollapsed(true);
        }
        setMessages((prev) => [...prev, assistantBubble]);
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message || 'Failed to get a reply';
        setError(errMsg);
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: 'assistant',
            content: `Sorry, something went wrong: ${errMsg}`,
            fallback: true,
          },
        ]);
      } finally {
        setSending(false);
        scrollToBottom();
      }
    },
    [conversationId, scrollToBottom, sending, stopSpeaking]
  );

  useEffect(() => {
    if (!sentInitial.current && initialPrompt && initialPrompt.trim()) {
      sentInitial.current = true;
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, sendMessage]);

  const submitVoiceTranscript = useCallback(() => {
    const transcript = String(finalTranscriptRef.current || '').trim();
    finalTranscriptRef.current = '';
    if (transcript) {
      sendMessage(transcript);
    }
  }, [sendMessage]);

  useEffect(() => {
    const ExpoSpeechRecognitionModule = SpeechRecognitionModule?.ExpoSpeechRecognitionModule;
    if (!ExpoSpeechRecognitionModule || !ExpoEventEmitter) {
      return undefined;
    }

    const speechEventEmitter = new ExpoEventEmitter(ExpoSpeechRecognitionModule);

    const onStart = speechEventEmitter.addListener('start', () => {
      setIsListening(true);
    });

    const onEnd = speechEventEmitter.addListener('end', () => {
      setIsListening(false);
      submitVoiceTranscript();
    });

    const onError = speechEventEmitter.addListener('error', (event) => {
      setIsListening(false);
      finalTranscriptRef.current = '';
      console.log('[AssistantChat] voice recognition error:', event?.message || event);
      Alert.alert('Voice error', event?.message || 'Voice recognition failed. Please try again.');
    });

    const onResult = speechEventEmitter.addListener('result', (event) => {
      const latest = event?.results?.[0]?.transcript || '';
      if (latest) {
        finalTranscriptRef.current = latest;
        setInput(latest);
      }

      if (event?.isFinal && latest) {
        submitVoiceTranscript();
      }
    });

    return () => {
      onStart?.remove?.();
      onEnd?.remove?.();
      onError?.remove?.();
      onResult?.remove?.();
    };
  }, [submitVoiceTranscript]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      if (SpeechRecognitionModule?.ExpoSpeechRecognitionModule?.stop) {
        try {
          SpeechRecognitionModule.ExpoSpeechRecognitionModule.stop();
        } catch (_) {
          /* no-op */
        }
      }
    };
  }, [stopSpeaking]);

  const startListening = useCallback(async () => {
    const ExpoSpeechRecognitionModule = SpeechRecognitionModule?.ExpoSpeechRecognitionModule;
    if (!ExpoSpeechRecognitionModule || !ExpoEventEmitter) {
      Alert.alert(
        'Voice not available',
        'Speech recognition is not included in this app build. Rebuild the development client to enable voice input.'
      );
      return;
    }
    try {
      if (Platform.OS === 'web' && !ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        Alert.alert('Voice not available', 'Speech recognition is not available in this browser.');
        return;
      }

      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission?.granted && permission?.status !== 'granted') {
        Alert.alert('Microphone permission needed', 'Please grant microphone access to use voice.');
        return;
      }

      finalTranscriptRef.current = '';
      setInput('');
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
      });
    } catch (err) {
      setIsListening(false);
      console.log('[AssistantChat] voice error:', err?.message || err);
      Alert.alert('Voice error', 'Could not start voice input. Please type your question.');
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (SpeechRecognitionModule?.ExpoSpeechRecognitionModule?.stop) {
      try {
        SpeechRecognitionModule.ExpoSpeechRecognitionModule.stop();
      } catch (_) {
        /* no-op */
      }
    }
    setIsListening(false);
  }, []);

  const lastFollowUps = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === 'assistant' && Array.isArray(m.followUps) && m.followUps.length > 0) {
        return m.followUps;
      }
    }
    return [];
  })();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.backButtonText}>{'\u2190'}  Back</Text>
            </Pressable>
          ) : <View />}

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
              onPress={startNewChat}
              style={({ pressed }) => [styles.headerPill, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.headerPillIcon}>{'\u2795'}</Text>
              <Text style={styles.headerPillText}>New</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show my past chats"
              onPress={openHistory}
              style={({ pressed }) => [styles.headerPill, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.headerPillIcon}>{'\u{1F4DA}'}</Text>
              <Text style={styles.headerPillText}>My chats</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.titleEmoji}>{'\u{1F49A}'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your Health Helper</Text>
            <Text style={styles.subtitle}>Ask me anything about your health.</Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={scrollToBottom}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>{'\u{1F44B}'}</Text>
            <Text style={styles.emptyTitle}>Hello! How can I help today?</Text>
            <Text style={styles.emptyHint}>
              Tap the microphone to talk, or pick a question below.
            </Text>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                accessibilityRole="button"
                accessibilityLabel={`Ask: ${prompt}`}
                onPress={() => sendMessage(prompt)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
              >
                <Text style={styles.suggestionEmoji}>{'\u{1F4AC}'}</Text>
                <Text style={styles.suggestionText}>{prompt}</Text>
              </Pressable>
            ))}
            <View style={styles.disclaimerCard}>
              <Text style={styles.disclaimerCardIcon}>{'\u2139\uFE0F'}</Text>
              <Text style={styles.disclaimerCardText}>
                I use your own health records to answer. I am here to help, but I am not a doctor.
              </Text>
            </View>
          </View>
        ) : null}

        {messages.map((m) => (
          <ChatBubble
            key={m.id}
            role={m.role}
            content={m.content}
            sql={m.sql}
            rows={m.rows}
            sources={m.sources}
            safetyNote={m.safetyNote}
            fallback={m.fallback}
            isSpeaking={speakingId === m.id}
            onSpeak={SpeechModule ? () => speakMessage(m) : null}
          />
        ))}

        {sending ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.thinkingText}>Looking through your records\u2026</Text>
          </View>
        ) : null}
      </ScrollView>

      {lastFollowUps.length > 0 && !sending ? (
        <View style={styles.followUpPanel}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={followUpsCollapsed ? 'Show suggested questions' : 'Hide suggested questions'}
            onPress={() => setFollowUpsCollapsed((prev) => !prev)}
            style={({ pressed }) => [styles.followUpHeader, pressed && styles.followUpHeaderPressed]}
          >
            <Text style={styles.followUpHeaderText}>Suggested questions</Text>
            <Text style={styles.followUpHeaderCount}>{lastFollowUps.length}</Text>
            <Text style={styles.followUpHeaderArrow}>
              {followUpsCollapsed ? '\u25BE' : '\u25B4'}
            </Text>
          </Pressable>

          {!followUpsCollapsed ? (
            <View style={styles.followUpRow}>
              {lastFollowUps.map((q) => (
                <Pressable
                  key={q}
                  accessibilityRole="button"
                  onPress={() => sendMessage(q)}
                  style={({ pressed }) => [styles.followUpChip, pressed && styles.followUpChipPressed]}
                >
                  <Text style={styles.followUpText} numberOfLines={2} ellipsizeMode="tail">
                    {getCompactPromptLabel(q)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {!!error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorBarText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.inputBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isListening ? 'Stop talking' : 'Tap to talk'}
          onPress={isListening ? stopListening : startListening}
          style={({ pressed }) => [
            styles.micButton,
            isListening && styles.micButtonActive,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.micIcon}>{isListening ? '\u25A0' : '\u{1F3A4}'}</Text>
          <Text style={[styles.micLabel, isListening && styles.micLabelActive]}>
            {isListening ? 'Stop' : 'Talk'}
          </Text>
        </Pressable>

        <TextInput
          style={styles.textInput}
          placeholder={isListening ? 'I am listening\u2026' : 'Type your question here\u2026'}
          placeholderTextColor="#9CA3AF"
          value={input}
          onChangeText={setInput}
          editable={!sending}
          multiline
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send my question"
          disabled={sending || !input.trim()}
          onPress={() => sendMessage(input)}
          style={({ pressed }) => [
            styles.sendButton,
            (!input.trim() || sending) && styles.sendButtonDisabled,
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={styles.sendButtonIcon}>{'\u27A4'}</Text>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>

      <Modal
        visible={showHistory}
        animationType="slide"
        transparent
        onRequestClose={closeHistory}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>My past chats</Text>
                <Text style={styles.modalSubtitle}>Tap a chat to continue it.</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close past chats"
                onPress={closeHistory}
                style={({ pressed }) => [styles.modalCloseButton, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={startNewChat}
              style={({ pressed }) => [styles.newChatRow, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.newChatIcon}>{'\u2795'}</Text>
              <Text style={styles.newChatText}>Start a new chat</Text>
            </Pressable>

            {loadingHistory ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.historyLoadingText}>Loading your chats\u2026</Text>
              </View>
            ) : null}

            {!!historyError ? (
              <Text style={styles.historyErrorText}>{historyError}</Text>
            ) : null}

            {!loadingHistory && !historyError && conversations.length === 0 ? (
              <View style={styles.historyEmptyBox}>
                <Text style={styles.historyEmptyEmoji}>{'\u{1F4AC}'}</Text>
                <Text style={styles.historyEmptyTitle}>No chats yet</Text>
                <Text style={styles.historyEmptyText}>
                  Ask me a question and your chats will appear here.
                </Text>
              </View>
            ) : null}

            <FlatList
              data={conversations}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.historyList}
              renderItem={({ item }) => {
                const isCurrent = conversationId === item.id;
                const isLoading = loadingConversationId === item.id;
                return (
                  <View
                    style={[
                      styles.historyRow,
                      isCurrent && styles.historyRowCurrent,
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open chat: ${item.title || 'Conversation'}`}
                      accessibilityHint="Long press for more options"
                      onPress={() => selectConversation(item)}
                      onLongPress={() => showConversationActions(item)}
                      delayLongPress={350}
                      style={({ pressed }) => [
                        styles.historyRowTop,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.historyRowEmoji}>{'\u{1F4AC}'}</Text>
                      <View style={styles.historyRowMain}>
                        <Text style={styles.historyRowTitle} numberOfLines={1}>
                          {item.title || 'Conversation'}
                        </Text>
                        {item.last_message ? (
                          <Text style={styles.historyRowSnippet} numberOfLines={2}>
                            {item.last_message}
                          </Text>
                        ) : null}
                        <Text style={styles.historyRowTime}>
                          {formatRelativeTime(item.updated_at || item.created_at)}
                          {isCurrent ? '  \u2022  Current chat' : ''}
                        </Text>
                      </View>
                      {isLoading ? (
                        <ActivityIndicator size="small" color="#2563EB" />
                      ) : null}
                    </Pressable>

                    <View style={styles.historyActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rename chat ${item.title || ''}`}
                        onPress={() => beginRename(item)}
                        style={({ pressed }) => [
                          styles.historyActionBtn,
                          styles.historyRenameBtn,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={styles.historyActionIcon}>{'\u270F\uFE0F'}</Text>
                        <Text style={styles.historyActionText}>Rename</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete chat ${item.title || ''}`}
                        onPress={() => confirmDelete(item)}
                        style={({ pressed }) => [
                          styles.historyActionBtn,
                          styles.historyDeleteBtn,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={styles.historyActionIcon}>{'\u{1F5D1}'}</Text>
                        <Text style={[styles.historyActionText, styles.historyDeleteText]}>
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(renameTarget)}
        transparent
        animationType="fade"
        onRequestClose={cancelRename}
      >
        <View style={styles.renameOverlay}>
          <View style={styles.renameDialog}>
            <Text style={styles.renameEmoji}>{'\u270F\uFE0F'}</Text>
            <Text style={styles.renameTitle}>Rename this chat</Text>
            <Text style={styles.renameSubtitle}>
              Give it a name you will remember.
            </Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="e.g. Weekly adherence review"
              placeholderTextColor="#9CA3AF"
              autoFocus
              maxLength={80}
              editable={!renameSaving}
              returnKeyType="done"
              onSubmitEditing={confirmRename}
            />
            <View style={styles.renameButtonRow}>
              <Pressable
                accessibilityRole="button"
                onPress={cancelRename}
                disabled={renameSaving}
                style={({ pressed }) => [
                  styles.renameButton,
                  styles.renameCancelButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.renameCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={confirmRename}
                disabled={renameSaving || !renameValue.trim()}
                style={({ pressed }) => [
                  styles.renameButton,
                  styles.renameSaveButton,
                  (renameSaving || !renameValue.trim()) && styles.renameSaveButtonDisabled,
                  pressed && { opacity: 0.8 },
                ]}
              >
                {renameSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.renameSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    paddingTop: 34,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 46,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  headerPillIcon: { fontSize: 16, marginRight: 6 },
  headerPillText: {
    color: '#1E3A8A',
    fontWeight: '900',
    fontSize: 16,
  },
  backButton: { minHeight: 46, justifyContent: 'center', paddingVertical: 6, paddingRight: 8 },
  backButtonText: { color: '#2563EB', fontWeight: '900', fontSize: 18 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  titleEmoji: { fontSize: 36, marginRight: 10 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '900', color: '#111827' },
  subtitle: { fontSize: 18, color: '#4B5563', marginTop: 2, lineHeight: 25 },

  scroll: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { paddingVertical: 14, paddingBottom: 24 },
  emptyState: { padding: 20 },
  emptyEmoji: { fontSize: 48, textAlign: 'center', marginBottom: 6 },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 18,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 27,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 64,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  suggestionPressed: { backgroundColor: '#EFF6FF' },
  suggestionEmoji: { fontSize: 22, marginRight: 12 },
  suggestionText: {
    flex: 1,
    color: '#111827',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '800',
  },
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 18,
    padding: 14,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  disclaimerCardIcon: { fontSize: 20, marginRight: 10 },
  disclaimerCardText: {
    flex: 1,
    fontSize: 16,
    color: '#92400E',
    lineHeight: 24,
    fontWeight: '700',
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  thinkingText: { marginLeft: 10, color: '#4B5563', fontSize: 17, fontWeight: '700' },

  followUpPanel: {
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  followUpHeader: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  followUpHeaderPressed: { backgroundColor: '#E5E7EB' },
  followUpHeaderText: {
    flex: 1,
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '900',
  },
  followUpHeaderCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 15,
    fontWeight: '900',
    paddingTop: 3,
  },
  followUpHeaderArrow: {
    color: '#1D4ED8',
    fontSize: 18,
    fontWeight: '900',
  },
  followUpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  followUpChip: {
    flexShrink: 1,
    maxWidth: '48%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    paddingHorizontal: 14,
    minHeight: 52,
    paddingVertical: 12,
    borderRadius: 22,
  },
  followUpChipPressed: { backgroundColor: '#EFF6FF' },
  followUpText: { color: '#1D4ED8', fontWeight: '900', fontSize: 16, lineHeight: 21 },

  errorBar: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#FCA5A5',
  },
  errorBarText: { color: '#991B1B', fontSize: 16, lineHeight: 22, fontWeight: '800' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  micButtonActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  micIcon: { fontSize: 24 },
  micLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#166534',
    marginTop: 2,
    letterSpacing: 0.4,
  },
  micLabelActive: { color: '#991B1B' },
  textInput: {
    flex: 1,
    maxHeight: 140,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 28,
    fontSize: 18,
    color: '#111827',
    lineHeight: 25,
  },
  sendButton: {
    marginLeft: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#2563EB',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    minHeight: 60,
    flexDirection: 'row',
  },
  sendButtonDisabled: { backgroundColor: '#9CA3AF' },
  sendButtonIcon: { color: '#FFFFFF', fontSize: 16, marginRight: 6 },
  sendButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 17 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  modalTitle: { fontSize: 24, fontWeight: '900', color: '#111827' },
  modalSubtitle: { fontSize: 16, lineHeight: 22, color: '#6B7280', marginTop: 2 },
  modalCloseButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
  },
  modalCloseText: { color: '#374151', fontWeight: '900', fontSize: 16 },

  newChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#EFF6FF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DBEAFE',
  },
  newChatIcon: { fontSize: 20, color: '#1D4ED8', marginRight: 12 },
  newChatText: { color: '#1D4ED8', fontWeight: '800', fontSize: 17 },

  historyLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  historyLoadingText: { marginLeft: 10, color: '#4B5563', fontSize: 16, fontWeight: '700' },
  historyErrorText: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: '#991B1B',
    backgroundColor: '#FEE2E2',
    fontSize: 16,
    lineHeight: 22,
  },
  historyEmptyBox: {
    paddingHorizontal: 20,
    paddingVertical: 36,
    alignItems: 'center',
  },
  historyEmptyEmoji: { fontSize: 44, marginBottom: 8 },
  historyEmptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  historyEmptyText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },

  historyList: { paddingHorizontal: 14, paddingBottom: 16, paddingTop: 4 },
  historyRow: {
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  historyRowCurrent: {
    backgroundColor: '#EEF2FF',
    borderColor: '#A5B4FC',
    borderWidth: 2,
  },
  historyRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  historyRowEmoji: { fontSize: 22, marginRight: 10, marginTop: 2 },
  historyRowMain: { flex: 1 },
  historyRowTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  historyRowSnippet: {
    fontSize: 16,
    color: '#4B5563',
    marginTop: 4,
    lineHeight: 23,
  },
  historyRowTime: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 6,
    fontWeight: '600',
  },
  historyActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  historyActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  historyRenameBtn: {
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  historyDeleteBtn: {},
  historyActionIcon: { fontSize: 16, marginRight: 6 },
  historyActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  historyDeleteText: { color: '#B91C1C' },

  renameOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  renameDialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  renameEmoji: { fontSize: 36, textAlign: 'center', marginBottom: 4 },
  renameTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  renameSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 22,
  },
  renameInput: {
    borderWidth: 2,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  renameButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  renameButton: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameCancelButton: {
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  renameCancelText: { color: '#374151', fontWeight: '700', fontSize: 16 },
  renameSaveButton: {
    backgroundColor: '#2563EB',
    marginLeft: 8,
  },
  renameSaveButtonDisabled: { backgroundColor: '#93C5FD' },
  renameSaveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});

export default AssistantChatScreen;
