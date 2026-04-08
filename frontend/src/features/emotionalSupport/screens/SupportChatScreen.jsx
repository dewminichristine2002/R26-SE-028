import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function SupportChatScreen({ navigation }) {
  const { lastCheckIn } = useEmotionalSupportContext();
  const messages = lastCheckIn
    ? [
        { role: 'assistant', text: lastCheckIn.intervention.responseText },
        { role: 'elder', text: lastCheckIn.activity.prompt },
        { role: 'assistant', text: 'When you are ready, continue with the activity and save the session summary.' },
      ]
    : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Support conversation</Text>
        <StatusMessage empty={!lastCheckIn} emptyText="Run a check-in first to open the support conversation." />
        {messages.map((message, index) => (
          <View
            key={`${message.role}-${index}`}
            style={[styles.bubble, message.role === 'assistant' ? styles.assistant : styles.elder]}
          >
            <Text style={styles.role}>{message.role}</Text>
            <Text style={styles.text}>{message.text}</Text>
          </View>
        ))}
        {lastCheckIn ? <ActionButton label="Continue to Summary" onPress={() => navigation.navigate('SessionSummary')} /> : null}
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
});
