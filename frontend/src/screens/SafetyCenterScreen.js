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
      icon: '✓',
      level: 'OK',
      headline: 'Correct Dose',
      detail: 'Medicine intake was completed.',
      accent: styles.issueIconGood,
      levelStyle: styles.levelGood,
      cardStyle: styles.issueCardGood,
    };
  }

  if (normalizedStatus === 'overdose') {
    const overdoseCount = Number(item?.overdose_tablets);
    const overdoseText = Number.isFinite(overdoseCount) && overdoseCount > 0
      ? `${overdoseCount} pill(s)`
      : 'extra pills';

    return {
      icon: '!',
      level: 'CHECK',
      headline: 'Incorrect Dose',
      detail: `Extra medicine recorded: ${overdoseText}.`,
      accent: styles.issueIconCaution,
      levelStyle: styles.levelCaution,
      cardStyle: styles.issueCardCaution,
    };
  }

  return {
    icon: '!',
    level: 'HELP',
    headline: 'Missed Dose',
    detail: 'Medicine was not taken.',
    accent: styles.issueIconCritical,
    levelStyle: styles.levelCritical,
    cardStyle: styles.issueCardCritical,
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
        title: 'Check Now',
        detail: `${overdoseCount} overdose record today. Please check the elder and medicine box.`,
        style: styles.monitorCardHigh,
      };
    }

    if (missedCount > 0) {
      return {
        title: 'Needs Attention',
        detail: `${missedCount} medicine not taken today. Please remind gently.`,
        style: styles.monitorCardWarn,
      };
    }

    return {
      title: 'All Good',
      detail: `${takenCount} medicine record(s) taken. No risk event now.`,
      style: styles.monitorCardSafe,
    };
  }, [missedCount, overdoseCount, takenCount]);

  const lastUpdatedText = lastUpdated
    ? `Last updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`
    : '';

  return (
    <View style={styles.page}>
      <View style={styles.staticHeaderWrap}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { fontSize: 24 * textScale, lineHeight: 30 * textScale }]}>🛡 Safety Center</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadTodayIssues}>
            <Text style={styles.refreshText}>↻</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.summaryGrid}>
        <View style={[styles.summaryCard, styles.summaryCardGood]}>
          <Text style={styles.summaryIcon}>✓</Text>
          <Text style={[styles.summaryNumber, { fontSize: 30 * textScale }]}>{takenCount}</Text>
          <Text style={[styles.summaryLabel, { fontSize: 13 * textScale }]}>Correct</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardMissed]}>
          <Text style={styles.summaryIcon}>!</Text>
          <Text style={[styles.summaryNumber, { fontSize: 30 * textScale }]}>{missedCount}</Text>
          <Text style={[styles.summaryLabel, { fontSize: 13 * textScale }]}>Missed</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardDanger]}>
          <Text style={styles.summaryIcon}>⚠</Text>
          <Text style={[styles.summaryNumber, { fontSize: 30 * textScale }]}>{overdoseCount}</Text>
          <Text style={[styles.summaryLabel, { fontSize: 13 * textScale }]}>Incorrect</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#d34b5f" />
          <Text style={[styles.loaderText, { fontSize: 14 * textScale }]}>Loading today's safety events...</Text>
        </View>
      ) : (
        <>
          <View style={styles.recentHeaderRow}>
            <Text style={[styles.sectionTitle, { fontSize: 21 * textScale, lineHeight: 27 * textScale }]}>Today Activity</Text>
            <TouchableOpacity style={styles.clearButton} onPress={() => setIssues([])}>
              <Text style={[styles.clearText, { fontSize: 14 * textScale }]}>Clear</Text>
            </TouchableOpacity>
          </View>

          {!issues.length ? (
            <View style={styles.emptyCard}>
              <Text style={[styles.emptyTitle, { fontSize: 18 * textScale }]}>No safety records</Text>
              <Text style={[styles.emptyText, { fontSize: 14 * textScale }]}>Today is clear.</Text>
            </View>
          ) : (
            issues.map((item) => {
              const display = getIssueDisplay(item);
              return (
                <View key={`${item.medication_id}-${item.eventDate}-${item.status}`} style={[styles.issueCard, display.cardStyle]}>
                  <View style={[styles.issueIcon, display.accent]}>
                    <Text style={styles.issueIconText}>{display.icon}</Text>
                  </View>
                  <View style={styles.issueBody}>
                    <View style={styles.issueTopRow}>
                      <Text style={[styles.issueHeadline, { fontSize: 18 * textScale, lineHeight: 23 * textScale }]}>{display.headline}</Text>
                      <Text style={[styles.issueLevel, display.levelStyle, { fontSize: 12 * textScale }]}>{display.level}</Text>
                    </View>
                    <Text style={[styles.issueMedicine, { fontSize: 21 * textScale, lineHeight: 27 * textScale }]}>{item.medicineName}</Text>
                    <Text style={[styles.issueTime, { fontSize: 14 * textScale }]}>{formatEventTime(item.eventDate)} Today</Text>
                    <Text style={[styles.issueDetail, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>{display.detail}</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f7efe4',
  },
  container: {
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 28,
    backgroundColor: '#f7efe4',
    flexGrow: 1,
  },
  staticHeaderWrap: {
    backgroundColor: '#f7efe4',
    paddingHorizontal: 14,
    paddingTop: 26,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: '#2f5d50',
    paddingHorizontal: 10,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#f4cf75',
    shadowColor: '#20382f',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  backButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff4c6',
  },
  backText: {
    fontSize: 32,
    lineHeight: 36,
    color: '#2f5d50',
    marginTop: -3,
    fontWeight: '900',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#ffffff',
    paddingHorizontal: 8,
  },
  refreshButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff4c6',
  },
  refreshText: {
    color: '#2f5d50',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
  },
  summaryGrid: {
    flexDirection: 'row',
    columnGap: 8,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 20,
    borderWidth: 2,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  summaryCardGood: {
    backgroundColor: '#e9f7f1',
    borderColor: '#a8dbc8',
  },
  summaryCardMissed: {
    backgroundColor: '#fff8e8',
    borderColor: '#f4cf75',
  },
  summaryCardDanger: {
    backgroundColor: '#fff0f2',
    borderColor: '#edbdc4',
  },
  summaryIcon: {
    fontSize: 23,
    lineHeight: 27,
    fontWeight: '900',
    color: '#2f5d50',
  },
  summaryNumber: {
    marginTop: 3,
    color: '#24352f',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  summaryLabel: {
    marginTop: 2,
    color: '#5d5045',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  loaderWrap: {
    paddingVertical: 44,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    color: '#5d5045',
    fontSize: 13,
    fontWeight: '800',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 27,
    color: '#2d241d',
    fontWeight: '900',
  },
  clearButton: {
    minHeight: 42,
    borderRadius: 16,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: '#2f5d50',
    fontWeight: '900',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#24352f',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  emptyText: {
    color: '#74665b',
    fontSize: 14,
    fontWeight: '700',
  },
  issueCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#eadcca',
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  issueCardGood: {
    borderLeftWidth: 6,
    borderLeftColor: '#2f8a5f',
  },
  issueCardCaution: {
    borderLeftWidth: 6,
    borderLeftColor: '#d88721',
  },
  issueCardCritical: {
    borderLeftWidth: 6,
    borderLeftColor: '#c74455',
  },
  issueIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  issueIconCritical: {
    backgroundColor: '#c74455',
  },
  issueIconCaution: {
    backgroundColor: '#d88721',
  },
  issueIconGood: {
    backgroundColor: '#2f8a5f',
  },
  issueIconText: {
    color: '#ffffff',
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    marginTop: -1,
  },
  issueBody: {
    flex: 1,
  },
  issueTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  issueHeadline: {
    flex: 1,
    color: '#24352f',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    marginRight: 6,
  },
  issueLevel: {
    fontSize: 12,
    fontWeight: '900',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
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
    marginTop: 4,
    color: '#2d241d',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
  },
  issueTime: {
    marginTop: 4,
    color: '#2f5d50',
    fontSize: 14,
    fontWeight: '900',
  },
  issueDetail: {
    marginTop: 6,
    color: '#5d5045',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  monitorCard: {
    marginTop: 10,
    borderRadius: 22,
    borderWidth: 2,
    padding: 16,
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
    color: '#24352f',
    fontSize: 18,
    fontWeight: '900',
  },
  monitorText: {
    marginTop: 6,
    color: '#5d5045',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  monitorMeta: {
    marginTop: 8,
    color: '#74665b',
    fontSize: 12,
    fontWeight: '800',
  },
});

export default SafetyCenterScreen;
