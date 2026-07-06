import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/ActionButton';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function SessionSummaryScreen({ navigation }) {
  const { lastActivityAttempt, lastCheckIn } = useEmotionalSupportContext();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Session summary</Text>
        <StatusMessage empty={!lastCheckIn} emptyText="No session has been completed yet." />

        {lastCheckIn ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Detected mood</Text>
              <Text style={styles.value}>{lastCheckIn.detectedEmotion}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Support given</Text>
              <Text style={styles.value}>{lastCheckIn.intervention.responseText}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Activity result</Text>
              <Text style={styles.value}>
                {lastActivityAttempt
                  ? `${lastActivityAttempt.completionStatus} with score ${lastActivityAttempt.score}`
                  : 'Activity not completed yet'}
              </Text>
            </View>
            <ActionButton label="Back to Elder Home" onPress={() => navigation.navigate('ElderHome')} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F8F4' },
  container: { padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', color: '#263126' },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DDD4',
  },
  label: { fontSize: 13, color: '#60705F', textTransform: 'uppercase', letterSpacing: 0.8 },
  value: { fontSize: 18, lineHeight: 26, color: '#2B342B', fontWeight: '600', marginTop: 6 },
});
