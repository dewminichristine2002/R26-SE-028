import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { medicationService } from '../services/medicationService';
import { routineService } from '../services/routineService';

const SLOT_TO_KEY = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  'BEFORE SLEEP': 'sleep',
};

const SLOT_LABELS = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  sleep: 'Before Sleep',
};

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'sleep'];

const SLOT_SHORT_LABELS = {
  breakfast: 'AM',
  lunch: 'PM',
  dinner: 'PM',
  sleep: 'PM',
};

const shapeIconMap = {
  round: '●',
  circle: '●',
  oval: '⬭',
  capsule: '⬯',
  tablet: '◼',
  oblong: '▭',
  square: '◼',
  triangle: '▲',
  diamond: '◆',
};

const colorMap = {
  red: '#e74c3c',
  blue: '#3498db',
  green: '#2ecc71',
  yellow: '#f1c40f',
  orange: '#e67e22',
  pink: '#ff6ea8',
  white: '#ecf0f1',
  black: '#2d3436',
  brown: '#8e6e53',
  gray: '#95a5a6',
  grey: '#95a5a6',
};

const normalizeSlotToken = (token = '') => token.toUpperCase().replace(/[_-]/g, ' ').trim();

const parseTakeWith = (takeWithValue = '') =>
  String(takeWithValue)
    .split(',')
    .map((part) => normalizeSlotToken(part))
    .filter(Boolean);

const getShapeIcon = (shape) => {
  const normalized = (shape || '').toString().trim().toLowerCase();
  return shapeIconMap[normalized] || '○';
};

const getColorValue = (color) => {
  const normalized = (color || '').toString().trim().toLowerCase();
  if (!normalized) {
    return '#d5dde8';
  }

  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    return normalized;
  }

  return colorMap[normalized] || '#d5dde8';
};

const parseRoutineTimeToDate = (timeStr, referenceDate = new Date()) => {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }

  const normalized = timeStr.trim().replace(/\./g, ':').replace(/\s+/g, ' ');
  const now = new Date(referenceDate);

  const twelveHourMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHourMatch) {
    let hours = Number(twelveHourMatch[1]);
    const minutes = Number(twelveHourMatch[2]);
    const period = twelveHourMatch[3].toUpperCase();

    if (period === 'PM' && hours < 12) {
      hours += 12;
    }
    if (period === 'AM' && hours === 12) {
      hours = 0;
    }

    const date = new Date(now);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      const date = new Date(now);
      date.setHours(hours, minutes, 0, 0);
      return date;
    }
  }

  return null;
};

const getReminderOffsetMinutes = (timingValue = '') => {
  const normalized = String(timingValue || '').toLowerCase();
  if (normalized.includes('before')) {
    return -30;
  }
  return 30;
};

const applyMinutesOffset = (sourceDate, minutesOffset) => {
  if (!sourceDate) {
    return null;
  }

  const next = new Date(sourceDate);
  next.setMinutes(next.getMinutes() + minutesOffset);
  return next;
};

const formatDateTo12Hour = (dateValue) => {
  if (!dateValue) {
    return '--:--';
  }

  return dateValue.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const format12HourTime = (timeStr, referenceDate = new Date()) => {
  const parsed = parseRoutineTimeToDate(timeStr, referenceDate);
  if (!parsed) {
    return '--:--';
  }

  return formatDateTo12Hour(parsed);
};

const formatEtaMinutes = (targetDate, nowDate) => {
  if (!targetDate || !nowDate) {
    return '';
  }

  const minutes = Math.max(0, Math.round((targetDate.getTime() - nowDate.getTime()) / 60000));
  if (minutes === 0) {
    return 'now';
  }
  if (minutes === 1) {
    return 'in 1 minute';
  }

  return `in ${minutes} minutes`;
};

const ScheduleBoardScreen = ({ onBack, user }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [routine, setRoutine] = useState(null);
  const [medications, setMedications] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const loadScheduleData = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const [routineData, medicationData] = await Promise.all([
          routineService.getRoutine(),
          medicationService.getMyMedications(),
        ]);

        setRoutine(routineData?.mealTimes || null);
        setMedications(medicationData || []);
      } catch (error) {
        setErrorMessage(error?.message || 'Could not load schedule data.');
      } finally {
        setIsLoading(false);
      }
    };

    loadScheduleData();
  }, []);

  useEffect(() => {
    // This runs on the device JS runtime, so it uses the phone's local clock.
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const scheduleRows = useMemo(() => {
    if (!routine || !medications.length) {
      return [];
    }

    const grouped = {
      breakfast: [],
      lunch: [],
      dinner: [],
      sleep: [],
    };

    medications.forEach((medicine) => {
      const slots = parseTakeWith(medicine.take_with);
      const validKeys = slots
        .map((slot) => SLOT_TO_KEY[slot])
        .filter(Boolean)
        .sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

      const timesPerDay = Math.max(validKeys.length, 1);

      validKeys.forEach((key, index) => {
        grouped[key].push({
          id: `${medicine.id}-${key}`,
          medicineName: medicine.medicine_name,
          dosageMg: medicine.dosage_mg,
          dailyAmount: medicine.daily_amount,
          timing: medicine.intake_timing,
          color: medicine.selected_color || medicine.medicine_color || '',
          shape: medicine.selected_shape || medicine.medicine_shape || '',
          timesPerDay,
          doseNumber: index + 1,
        });
      });
    });

    return Object.entries(grouped)
      .map(([slotKey, items]) => ({
        slotKey,
        slotLabel: SLOT_LABELS[slotKey],
        time: routine[slotKey],
        items,
      }))
      .filter((row) => row.items.length > 0)
      .sort((a, b) => {
        const order = ['breakfast', 'lunch', 'dinner', 'sleep'];
        return order.indexOf(a.slotKey) - order.indexOf(b.slotKey);
      });
  }, [routine, medications]);

  const flatSchedule = useMemo(
    () =>
      scheduleRows
        .flatMap((row) =>
          row.items.map((item, index) => {
            const baseDate = parseRoutineTimeToDate(row.time, currentTime);
            const normalizedTiming = String(item.timing || '').toLowerCase();
            const offsetMinutes = getReminderOffsetMinutes(item.timing);
            const reminderDate = applyMinutesOffset(baseDate, offsetMinutes);
            const reminderRuleLabel =
              normalizedTiming.includes('before')
                ? 'Before -30m'
                : 'After +30m';

            return {
              ...item,
              rowKey: row.slotKey,
              rowLabel: row.slotLabel,
              rowShort: SLOT_SHORT_LABELS[row.slotKey] || 'AM',
              routineTime: row.time,
              reminderTime: reminderDate,
              reminderTimeLabel: formatDateTo12Hour(reminderDate),
              reminderRuleLabel,
              sortDate: reminderDate,
              stableId: `${item.id}-${index}`,
            };
          })
        )
        .sort((a, b) => {
          if (!a.sortDate && !b.sortDate) {
            return 0;
          }
          if (!a.sortDate) {
            return 1;
          }
          if (!b.sortDate) {
            return -1;
          }
          return a.sortDate.getTime() - b.sortDate.getTime();
        }),
    [scheduleRows, currentTime]
  );

  const nextDose = useMemo(() => {
    if (!flatSchedule.length) {
      return null;
    }

    const now = currentTime;
    const withFutureMarker = flatSchedule.map((item) => {
      const baseDate = item.sortDate;
      if (!baseDate) {
        return { ...item, nextDate: null };
      }

      const nextDate = new Date(baseDate);
      if (nextDate.getTime() < now.getTime()) {
        nextDate.setDate(nextDate.getDate() + 1);
      }

      return { ...item, nextDate };
    });

    withFutureMarker.sort((a, b) => {
      if (!a.nextDate && !b.nextDate) {
        return 0;
      }
      if (!a.nextDate) {
        return 1;
      }
      if (!b.nextDate) {
        return -1;
      }
      return a.nextDate.getTime() - b.nextDate.getTime();
    });

    if (withFutureMarker[0]) {
      return withFutureMarker[0];
    }

    return flatSchedule[0] || null;
  }, [flatSchedule, currentTime]);

  const nextDoseDisplayTime = useMemo(() => {
    if (!nextDose) {
      return '--:--';
    }

    if (nextDose.reminderTimeLabel && nextDose.reminderTimeLabel !== '--:--') {
      return nextDose.reminderTimeLabel;
    }

    if (nextDose.routineTime) {
      return format12HourTime(nextDose.routineTime, currentTime);
    }

    return '--:--';
  }, [nextDose, currentTime]);

  const nextDoseEtaLabel = useMemo(
    () => formatEtaMinutes(nextDose?.nextDate || null, currentTime),
    [nextDose?.nextDate, currentTime]
  );

  const greetingName = useMemo(() => {
    const fullName = (user?.fullName || '').trim();
    if (!fullName) {
      return 'there';
    }

    return fullName.split(' ')[0];
  }, [user?.fullName]);

  const currentDateLabel = useMemo(
    () =>
      currentTime.toLocaleDateString([], {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    [currentTime]
  );

  const currentTimeLabel = useMemo(
    () =>
      currentTime.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }),
    [currentTime]
  );

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Schedule Board</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerActionButton}>
              <Text style={styles.headerActionIcon}>🔊</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerActionButton}>
              <Text style={styles.headerActionIcon}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.greetingRow}>
          <View>
            <Text style={styles.greetingTitle}>Hello, {greetingName}</Text>
            <Text style={styles.greetingSubtitle}>Ready for your schedule today?</Text>
          </View>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>👤</Text>
            <View style={styles.onlineDot} />
          </View>
        </View>

        <View style={styles.dateTimeCard}>
          <Text style={styles.dateTimeLabel}>Date</Text>
          <Text style={styles.dateTimeValue}>{currentDateLabel}</Text>
          <Text style={[styles.dateTimeLabel, styles.timeLabelSpacing]}>Time</Text>
          <Text style={styles.dateTimeValue}>{currentTimeLabel}</Text>
        </View>

        <View style={styles.nextDoseCard}>
          <View style={styles.nextDoseMetaRow}>
            <View>
              <Text style={styles.nextDoseLabel}>Next Dose At</Text>
              <Text style={styles.nextDoseTime}>{nextDoseDisplayTime}</Text>
            </View>
            {!!nextDoseEtaLabel && (
              <View style={styles.etaBadge}>
                <Text style={styles.etaBadgeText}>{nextDoseEtaLabel}</Text>
              </View>
            )}
          </View>

          {nextDose ? (
            <View style={styles.highlightMedicineRow}>
              <View style={[styles.highlightAppearance, { backgroundColor: getColorValue(nextDose.color) }]}>
                <Text style={styles.highlightAppearanceIcon}>{getShapeIcon(nextDose.shape)}</Text>
              </View>
              <View style={styles.highlightTextWrap}>
                <Text style={styles.highlightMedicineName}>{nextDose.medicineName}</Text>
                <Text style={styles.highlightMedicineMeta}>{nextDose.dosageMg}mg</Text>
                <Text style={styles.highlightMedicineSubMeta}>
                  {nextDose.timesPerDay} {nextDose.timesPerDay === 1 ? 'time' : 'times'} / day
                </Text>
                <Text style={styles.highlightMedicineDoseText}>
                  Dose {nextDose.doseNumber || 1} of {nextDose.timesPerDay || 1}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.noNextDoseWrap}>
              <Text style={styles.noNextDoseText}>No upcoming dose found.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.takenButton}>
            <Text style={styles.takenButtonText}>TAKEN</Text>
          </TouchableOpacity>

          <View style={styles.quickActionRow}>
            <TouchableOpacity style={styles.quickActionButton}>
              <Text style={styles.quickActionIcon}>🕒</Text>
              <Text style={styles.quickActionText}>Snooze</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickActionButton, styles.quickActionButtonCompact]}>
              <Text style={styles.quickActionText}>...</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{flatSchedule.length} total</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#2f8fd0" />
            <Text style={styles.loaderText}>Loading daily schedule...</Text>
          </View>
        ) : null}

        {!isLoading && !!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        {!isLoading && !errorMessage && flatSchedule.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No schedules yet</Text>
            <Text style={styles.emptyText}>Add medicines with meal timing to see them on Schedule Board.</Text>
          </View>
        )}

        {!isLoading && !errorMessage && flatSchedule.map((entry) => (
          <TouchableOpacity key={entry.stableId} style={styles.scheduleItemCard} activeOpacity={0.9}>
            <View style={styles.scheduleTimeCol}>
              <Text style={styles.schedulePeriod}>{entry.rowShort}</Text>
              <Text style={styles.scheduleTime}>{entry.reminderTimeLabel || format12HourTime(entry.routineTime, currentTime)}</Text>
            </View>

            <View style={styles.scheduleMainCol}>
              <Text style={styles.scheduleMedicineName}>{entry.medicineName}</Text>
              <Text style={styles.scheduleMetaText}>
                {entry.dosageMg}mg • {entry.rowLabel} • {entry.reminderRuleLabel}
              </Text>
              <Text style={styles.scheduleSubMetaText}>
                {entry.timesPerDay} {entry.timesPerDay === 1 ? 'time' : 'times'} / day
              </Text>
              <Text style={styles.scheduleDoseText}>
                Dose {entry.doseNumber || 1} of {entry.timesPerDay || 1}
              </Text>
            </View>

            <View style={[styles.scheduleAppearanceDot, { backgroundColor: getColorValue(entry.color) }]}>
              <Text style={styles.scheduleAppearanceShape}>{getShapeIcon(entry.shape)}</Text>
            </View>

            <Text style={styles.scheduleArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.fabButton} activeOpacity={0.85}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f7f7f5',
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#f7f7f5',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 90,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e9eef3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: '#445a6d',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 20,
    color: '#1f2934',
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  headerActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#dde5ed',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionIcon: {
    fontSize: 14,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  greetingTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#1f2934',
    lineHeight: 36,
  },
  greetingSubtitle: {
    marginTop: 2,
    fontSize: 15,
    color: '#687785',
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dde5ea',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 22,
  },
  onlineDot: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#28c269',
    right: 0,
    bottom: 2,
    borderWidth: 2,
    borderColor: '#f7f7f5',
  },
  dateTimeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7e2ec',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  dateTimeLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6f7f8f',
    fontWeight: '700',
  },
  dateTimeValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: '#24313d',
  },
  timeLabelSpacing: {
    marginTop: 8,
  },
  nextDoseCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c8dceb',
    backgroundColor: '#dcebfa',
    padding: 12,
    marginBottom: 16,
  },
  nextDoseMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  nextDoseLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700',
    color: '#4c7898',
    letterSpacing: 0.4,
  },
  nextDoseTime: {
    marginTop: 3,
    fontSize: 19,
    fontWeight: '800',
    color: '#156aa2',
  },
  etaBadge: {
    borderRadius: 10,
    backgroundColor: '#aec8de',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  etaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2f5f7f',
  },
  highlightMedicineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 11,
    padding: 10,
    marginBottom: 10,
  },
  highlightAppearance: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  highlightAppearanceIcon: {
    fontSize: 14,
    color: '#526271',
  },
  highlightTextWrap: {
    flex: 1,
  },
  highlightMedicineName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2a35',
    lineHeight: 30,
  },
  highlightMedicineMeta: {
    marginTop: 2,
    fontSize: 16,
    color: '#5f6f7f',
  },
  highlightMedicineSubMeta: {
    marginTop: 2,
    fontSize: 13,
    color: '#5f6f7f',
    fontWeight: '600',
  },
  highlightMedicineDoseText: {
    marginTop: 1,
    fontSize: 12,
    color: '#4d7ea4',
    fontWeight: '700',
  },
  noNextDoseWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d7e5f2',
    backgroundColor: '#f8fbff',
    padding: 12,
    marginBottom: 10,
  },
  noNextDoseText: {
    fontSize: 13,
    color: '#57738c',
  },
  takenButton: {
    borderRadius: 10,
    backgroundColor: '#2e8ce7',
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 8,
  },
  takenButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.6,
  },
  quickActionRow: {
    flexDirection: 'row',
    columnGap: 8,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 5,
  },
  quickActionButtonCompact: {
    flex: 0.3,
  },
  quickActionIcon: {
    fontSize: 12,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2f3c49',
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2934',
    lineHeight: 30,
  },
  totalBadge: {
    borderRadius: 10,
    backgroundColor: '#ecefef',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  totalBadgeText: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: '#6d7783',
    fontWeight: '700',
  },
  scheduleItemCard: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e7ed',
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  scheduleTimeCol: {
    width: 66,
    marginRight: 8,
  },
  schedulePeriod: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: '#6f7a87',
    fontWeight: '700',
  },
  scheduleTime: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: '800',
    color: '#212d37',
  },
  scheduleMainCol: {
    flex: 1,
  },
  scheduleMedicineName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2934',
    lineHeight: 22,
  },
  scheduleMetaText: {
    marginTop: 1,
    fontSize: 14,
    color: '#768596',
  },
  scheduleSubMetaText: {
    marginTop: 1,
    fontSize: 12,
    color: '#7e8b99',
    fontWeight: '600',
  },
  scheduleDoseText: {
    marginTop: 1,
    fontSize: 12,
    color: '#4d7ea4',
    fontWeight: '700',
  },
  scheduleAppearanceDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  scheduleAppearanceShape: {
    fontSize: 10,
    color: '#65717e',
  },
  scheduleArrow: {
    marginLeft: 9,
    fontSize: 22,
    color: '#b3bdc8',
  },
  fabButton: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2f90eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0b4f8f',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  fabText: {
    fontSize: 34,
    lineHeight: 34,
    color: '#ffffff',
    marginTop: -2,
  },
  loaderWrap: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 8,
    fontSize: 14,
    color: '#5d748a',
  },
  errorText: {
    color: '#c0392b',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dce6ef',
    backgroundColor: '#ffffff',
    padding: 14,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2b4054',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#63798d',
  },
});

export default ScheduleBoardScreen;
