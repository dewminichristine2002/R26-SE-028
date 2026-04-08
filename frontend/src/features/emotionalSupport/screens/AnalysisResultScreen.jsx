import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import ActionButton from '../components/ActionButton';
import ActivityCard from '../components/ActivityCard';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function AnalysisResultScreen({ navigation }) {
  const { lastCheckIn } = useEmotionalSupportContext();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Emotion analysis result</Text>
        <StatusMessage empty={!lastCheckIn} emptyText="Complete a check-in first to see the analysis result." />

        {lastCheckIn ? (
          <>
            <Text style={styles.emotion}>Detected emotion: {lastCheckIn.detectedEmotion}</Text>
            <Text style={styles.response}>{lastCheckIn.intervention.responseText}</Text>

            <ActivityCard
              title={lastCheckIn.activity.title}
              type={lastCheckIn.activity.type}
              prompt={lastCheckIn.activity.prompt}
            />

            <ActionButton label="Start Cognitive Activity" onPress={() => navigation.navigate('CognitiveActivity')} />
            <ActionButton label="Open Support Chat" variant="secondary" onPress={() => navigation.navigate('SupportChat')} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FCF6F2' },
  container: { padding: 20, gap: 18 },
  title: { fontSize: 28, fontWeight: '700', color: '#3A241D' },
  emotion: { fontSize: 18, fontWeight: '600', color: '#855742' },
  response: { fontSize: 16, lineHeight: 24, color: '#5F4A42' },
});
