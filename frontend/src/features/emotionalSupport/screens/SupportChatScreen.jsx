import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import StatusMessage from '../components/StatusMessage';
import { getChatLogs } from '../api/emotionalSupportApi';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function SupportChatScreen({ navigation }) {
  const { lastCheckIn } = useEmotionalSupportContext();
  const [chatLogs, setChatLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadChatLogs = async () => {
      if (!lastCheckIn?.sessionId) {
        setChatLogs([]);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await getChatLogs(lastCheckIn.sessionId);
        setChatLogs(response.data.items || []);
      } catch (loadError) {
        setError(
          loadError?.response?.data?.error ||
            loadError?.message ||
            'Failed to load support chat history.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadChatLogs();
  }, [lastCheckIn?.sessionId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Support conversation</Text>
        <StatusMessage
          empty={!lastCheckIn}
          emptyText="Run a check-in first to open the support conversation."
          loading={loading}
          error={error}
        />
        {chatLogs.map((message) => {
          const isSystem = message.actorType === 'system';

          return (
            <View
              key={message.id}
              style={[styles.bubble, isSystem ? styles.assistant : styles.elder]}
            >
              <Text style={styles.role}>{isSystem ? 'system' : 'elder'}</Text>
              <Text style={styles.text}>{message.messageText}</Text>
              {message.detectedEmotion ? (
                <Text style={styles.meta}>emotion: {message.detectedEmotion}</Text>
              ) : null}
            </View>
          );
        })}
        {lastCheckIn ? (
          <ActionButton
            label="Continue to Summary"
            onPress={() => navigation.navigate('SessionSummary')}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F4EF' },
  container: { padding: 20, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#273126', marginBottom: 6 },
  bubble: { padding: 16, borderRadius: 18, gap: 6 },
  assistant: { backgroundColor: '#E2EBD8' },
  elder: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7DDCF' },
  role: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#63715B' },
  text: { fontSize: 15, lineHeight: 22, color: '#364136' },
  meta: { fontSize: 12, color: '#627063' },
});
