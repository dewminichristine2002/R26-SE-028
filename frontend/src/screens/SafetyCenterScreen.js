import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { medicationService } from '../services/medicationService';

const formatEventTime = (value) => {
  if (!value) {
    return '--:--';
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return '--:--';
  }

  return dateValue.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const getIssueDisplay = (item) => {
  const normalizedStatus = String(item?.status || '').toLowerCase();

  if (normalizedStatus === 'taken') {
    return {
      level: 'GOOD',
      headline: 'Taken',
      detail: `${item.medicineName} was taken as scheduled.`,
      accent: styles.issueIconGood,
      levelStyle: styles.levelGood,
    };
  }

  if (normalizedStatus === 'overdose') {
    const overdoseCount = Number(item?.overdose_tablets);
    const overdoseText = Number.isFinite(overdoseCount) && overdoseCount > 0
      ? `${overdoseCount} pill(s)`
      : 'extra pills';

    return {
      level: 'CAUTION',
      headline: 'Overdose',
      detail: `${item.medicineName} overdose recorded (${overdoseText}).`,
      accent: styles.issueIconCaution,
      levelStyle: styles.levelCaution,
    };
  }

  return {
    level: 'CRITICAL',
    headline: 'Not Taken',
    detail: `${item.medicineName} was not taken on schedule.`,
    accent: styles.issueIconCritical,
    levelStyle: styles.levelCritical,
  };
};

const SafetyCenterScreen = ({ onBack, reminderTextScale = 1 }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [issues, setIssues] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const textScale = reminderTextScale || 1;

  const loadTodayIssues = async () => {
    try {
      setIsLoading(true);
      const [events, medications] = await Promise.all([
        medicationService.getTodayLatestStatusEvents(),
        medicationService.getMyMedications(),
      ]);

      const medicineNameById = (medications || []).reduce((acc, med) => {
        acc[med.id] = med.medicine_name || 'Medicine';
        return acc;
      }, {});

      const filteredIssues = (events || [])
        .filter((item) => {
          const normalized = String(item?.status || '').toLowerCase();
          return normalized === 'taken' || normalized === 'not-taken' || normalized === 'overdose';
        })
        .map((item) => ({
          ...item,
          medicineName: medicineNameById[item.medication_id] || 'Medicine',
          eventDate: item.event_time || item.created_at,
        }))
        .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

      setIssues(filteredIssues);
      setLastUpdated(new Date());
    } catch (error) {
      console.log('[SafetyCenter] load failed:', error?.message || error);
      setIssues([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTodayIssues();

    const intervalId = setInterval(() => {
      loadTodayIssues();
    }, 15000);

    return () => clearInterval(intervalId);
  }, []);

  const missedCount = useMemo(
    () => issues.filter((item) => String(item?.status || '').toLowerCase() === 'not-taken').length,
    [issues]
  );
  const takenCount = useMemo(
    () => issues.filter((item) => String(item?.status || '').toLowerCase() === 'taken').length,
    [issues]
  );
  const overdoseCount = useMemo(
    () => issues.filter((item) => String(item?.status || '').toLowerCase() === 'overdose').length,
    [issues]
  );

  const monitoringState = useMemo(() => {
    if (overdoseCount > 0) {
      return {
        title: 'Smart Monitoring: Please Check Now',
        detail: `I found ${overdoseCount} overdose event(s) today. Please check the elder user and medicine routine now.`,
        style: styles.monitorCardHigh,
      };
    }

    if (missedCount > 0) {
      return {
        title: 'Smart Monitoring: Attention Needed',
        detail: `I found ${missedCount} non-taken event(s) today. Please remind the elder user gently for the next dose.`,
        style: styles.monitorCardWarn,
      };
    }

    return {
      title: 'Smart Monitoring Active',
      detail: `Great progress today. ${takenCount} dose(s) were taken on time and no risk events were detected.`,
      style: styles.monitorCardSafe,
    };
  }, [missedCount, overdoseCount, takenCount]);

  const lastUpdatedText = lastUpdated
    ? `Last updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`
    : '';

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontSize: 24 * textScale }]}>Safety Center</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={loadTodayIssues}>
          <Text style={styles.refreshText}>i</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <Text style={[styles.summaryText, { fontSize: 14 * textScale }]}>Taken: {takenCount}   Non-Taken: {missedCount}   Overdose: {overdoseCount}</Text>
      </View>

      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#d34b5f" />
          <Text style={[styles.loaderText, { fontSize: 14 * textScale }]}>Loading today's safety events...</Text>
        </View>
      ) : (
        <>
          <View style={styles.recentHeaderRow}>
            <Text style={[styles.sectionTitle, { fontSize: 19 * textScale }]}>Recent Activity</Text>
            <TouchableOpacity onPress={() => setIssues([])}>
              <Text style={[styles.clearText, { fontSize: 13 * textScale }]}>Clear All</Text>
            </TouchableOpacity>
          </View>

          {!issues.length ? (
            <View style={styles.emptyCard}>
              <Text style={[styles.emptyText, { fontSize: 14 * textScale }]}>No taken, non-taken, or overdose entries for today's schedule.</Text>
            </View>
          ) : (
            issues.map((item) => {
              const display = getIssueDisplay(item);
              return (
                <View key={`${item.medication_id}-${item.eventDate}-${item.status}`} style={styles.issueCard}>
                  <View style={[styles.issueIcon, display.accent]}>
                    <Text style={styles.issueIconText}>!</Text>
                  </View>
                  <View style={styles.issueBody}>
                    <View style={styles.issueTopRow}>
                      <Text style={[styles.issueHeadline, { fontSize: 16 * textScale }]}>{display.headline}</Text>
                      <Text style={[styles.issueLevel, display.levelStyle, { fontSize: 11 * textScale }]}>{display.level}</Text>
                    </View>
                    <Text style={[styles.issueMedicine, { fontSize: 15 * textScale }]}>{item.medicineName}</Text>
                    <Text style={[styles.issueTime, { fontSize: 12 * textScale }]}>{formatEventTime(item.eventDate)} Today</Text>
                    <Text style={[styles.issueDetail, { fontSize: 13 * textScale }]}>{display.detail}</Text>
                  </View>
                </View>
              );
            })
          )}

          <View style={[styles.monitorCard, monitoringState.style]}>
            <Text style={[styles.monitorTitle, { fontSize: 17 * textScale }]}>{monitoringState.title}</Text>
            <Text style={[styles.monitorText, { fontSize: 14 * textScale }]}>{monitoringState.detail}</Text>
            {!!lastUpdatedText && <Text style={[styles.monitorMeta, { fontSize: 12 * textScale }]}>{lastUpdatedText}</Text>}
          </View>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 14,
    paddingBottom: 28,
    backgroundColor: '#f4f4f6',
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 18,
    color: '#3a3f48',
    marginTop: -1,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2530',
  },
  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: {
    color: '#5e7180',
    fontSize: 16,
    fontWeight: '700',
  },
  summaryRow: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8ec',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  summaryText: {
    color: '#455160',
    fontWeight: '600',
    fontSize: 13,
  },
  loaderWrap: {
    paddingVertical: 44,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    color: '#5d6775',
    fontSize: 13,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 23,
    color: '#242b35',
    fontWeight: '700',
  },
  clearText: {
    color: '#4e8cc6',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e8ee',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  emptyText: {
    color: '#5f6d7b',
    fontSize: 13,
  },
  issueCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e4e8ee',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
  },
  issueIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  issueIconCritical: {
    backgroundColor: '#f8dde2',
  },
  issueIconCaution: {
    backgroundColor: '#fcead8',
  },
  issueIconGood: {
    backgroundColor: '#dff4e8',
  },
  issueIconText: {
    color: '#9d2f40',
    fontSize: 16,
    fontWeight: '700',
    marginTop: -1,
  },
  issueBody: {
    flex: 1,
  },
  issueTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  issueHeadline: {
    color: '#29323f',
    fontSize: 12,
    fontWeight: '800',
    marginRight: 6,
    textTransform: 'uppercase',
  },
  issueLevel: {
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  levelCritical: {
    color: '#b43345',
    backgroundColor: '#f8dde2',
  },
  levelCaution: {
    color: '#8d5a12',
    backgroundColor: '#fff2dc',
  },
  levelGood: {
    color: '#1f7a49',
    backgroundColor: '#dff4e8',
  },
  issueMedicine: {
    marginTop: 2,
    color: '#212a35',
    fontSize: 21,
    fontWeight: '700',
  },
  issueTime: {
    marginTop: 2,
    color: '#5c6a78',
    fontSize: 12,
    fontWeight: '600',
  },
  issueDetail: {
    marginTop: 5,
    color: '#495868',
    fontSize: 12,
  },
  monitorCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  monitorCardHigh: {
    backgroundColor: '#fce8ec',
    borderColor: '#f0c7d0',
  },
  monitorCardWarn: {
    backgroundColor: '#fff3e3',
    borderColor: '#f3ddba',
  },
  monitorCardSafe: {
    backgroundColor: '#eef3f7',
    borderColor: '#dfe6ed',
  },
  monitorTitle: {
    color: '#2e3742',
    fontSize: 15,
    fontWeight: '700',
  },
  monitorText: {
    marginTop: 4,
    color: '#5f6b79',
    fontSize: 12,
    lineHeight: 18,
  },
  monitorMeta: {
    marginTop: 6,
    color: '#6b7785',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default SafetyCenterScreen;
