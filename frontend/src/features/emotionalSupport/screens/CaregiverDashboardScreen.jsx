import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCaregiverElders } from '../api/emotionalSupportApi';
import ActionButton from '../components/ActionButton';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function CaregiverDashboardScreen({ navigation }) {
  const { caregiverId } = useEmotionalSupportContext();
  const [elders, setElders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadElders() {
      try {
        setLoading(true);
        setError('');
        const { data } = await getCaregiverElders(caregiverId);

        if (active) {
          setElders(data.items || []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.error || 'Failed to load caregiver dashboard.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadElders();
    return () => {
      active = false;
    };
  }, [caregiverId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Caregiver dashboard</Text>
        <StatusMessage loading={loading} error={error} empty={!elders.length} emptyText="No assigned elders found." />
        {elders.map((elder) => (
          <View key={elder.elderId} style={styles.card}>
            <Text style={styles.name}>{elder.elderName}</Text>
            <Text style={styles.meta}>Latest mood: {elder.latestEmotion || 'No check-in yet'}</Text>
            <Text style={styles.meta}>Risk level: {elder.riskLevel || 'Unknown'}</Text>
            <Text style={styles.meta}>Open alerts: {elder.openAlertCount}</Text>
            <ActionButton
              label="View Elder Detail"
              variant="secondary"
              onPress={() => navigation.navigate('ElderDetail', { elderId: elder.elderId })}
            />
          </View>
        ))}
        <ActionButton label="Open Alerts" onPress={() => navigation.navigate('CaregiverAlertList')} />
        <ActionButton label="Back to Elder Home" variant="secondary" onPress={() => navigation.navigate('ElderHome')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F3FA' },
  container: { padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', color: '#2F2740' },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD6EE',
    gap: 6,
  },
  name: { fontSize: 18, fontWeight: '700', color: '#322B45' },
  meta: { fontSize: 15, color: '#675E7F' },
});
