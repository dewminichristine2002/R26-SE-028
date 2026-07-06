import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { acknowledgeAlert, getCaregiverAlerts } from '../api/emotionalSupportApi';
import ActionButton from '../components/ActionButton';
import StatusMessage from '../components/StatusMessage';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';

export default function CaregiverAlertListScreen() {
  const { caregiverId } = useEmotionalSupportContext();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadAlerts() {
      try {
        setLoading(true);
        setError('');
        const { data } = await getCaregiverAlerts(caregiverId, 'all');

        if (active) {
          setAlerts(data.items || []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.response?.data?.error || 'Failed to load caregiver alerts.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAlerts();
    return () => {
      active = false;
    };
  }, [caregiverId]);

  async function handleAcknowledge(alertId) {
    try {
      await acknowledgeAlert(alertId, caregiverId);
      const { data } = await getCaregiverAlerts(caregiverId, 'all');
      setAlerts(data.items || []);
    } catch (ackError) {
      setError(ackError.response?.data?.error || 'Failed to acknowledge alert.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Caregiver alerts</Text>
        <StatusMessage loading={loading} error={error} empty={!alerts.length} emptyText="No caregiver alerts found." />
        {alerts.map((alert) => (
          <View key={alert.alertId} style={styles.card}>
            <Text style={styles.severity}>{alert.severity}</Text>
            <Text style={styles.cardTitle}>{alert.title}</Text>
            <Text style={styles.message}>{alert.message}</Text>
            <Text style={styles.message}>Status: {alert.status}</Text>
            {alert.status === 'open' ? (
              <ActionButton
                label="Acknowledge Alert"
                variant="secondary"
                onPress={() => handleAcknowledge(alert.alertId)}
              />
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FBF4F1' },
  container: { padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', color: '#3E261D' },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8D6CF',
    gap: 8,
  },
  severity: { fontSize: 12, fontWeight: '700', color: '#9C5135', textTransform: 'uppercase', letterSpacing: 1 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#402C26' },
  message: { fontSize: 15, lineHeight: 22, color: '#674E47' },
});
