import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { medicationService } from '../services/medicationService';
import { reminderNotificationService } from '../services/reminderNotificationService';
import { routineService } from '../services/routineService';

let SpeechModule = null;
let ExpoSpeechRecognitionModule = null;
let ExpoEventEmitter = null;

try {
  SpeechModule = require('expo-speech');
} catch (error) {
  console.log('[ScheduleBoard] Speech module unavailable:', error?.message || error);
}

try {
  const speech = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speech.ExpoSpeechRecognitionModule;
} catch (error) {
  console.log('[ScheduleBoard] speech recognition module unavailable:', error?.message || error);
}

try {
  const expoModulesCore = require('expo-modules-core');
  ExpoEventEmitter = expoModulesCore.EventEmitter;
} catch (error) {
  console.log('[ScheduleBoard] EventEmitter unavailable:', error?.message || error);
}

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

const STATUS_LABELS = {
  taken: 'Taken',
  remind: 'Remind',
  overdose: 'Overdose',
  speak: 'Voice Mark',
  'not-taken': 'Not Taken',
};

const getEntryStatusKey = (entry) => `${entry?.medicationId || 'med'}-${entry?.rowKey || 'slot'}-${entry?.doseNumber || 1}`;
const getEntryDoseInstanceKey = (entry) => {
  const baseKey = getEntryStatusKey(entry);
  const nextDateKey = entry?.dueDate
    ? new Date(entry.dueDate).toISOString()
    : entry?.nextDate
      ? new Date(entry.nextDate).toISOString()
      : 'no-date';
  return `${baseKey}-${nextDateKey}`;
};

const parseMinutesFromVoiceText = (text) => {
  const minuteDigitsMatch = text.match(/(\d{1,3})\s*(minute|minutes|min|mins)/i);
  if (minuteDigitsMatch) {
    const parsed = Number(minuteDigitsMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const wordToNumber = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
  };

  const wordMatch = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\b\s*(minute|minutes|min|mins)/i);
  if (wordMatch) {
    return wordToNumber[wordMatch[1].toLowerCase()] || 10;
  }

  return 10;
};

const parseOverdoseTabletsFromVoiceText = (text) => {
  const normalized = String(text || '').toLowerCase();

  const numericWithFractionMatch = normalized.match(/(\d{1,3})(?:\s+and\s+a\s+half|\s+and\s+half)/i);
  if (numericWithFractionMatch) {
    const base = Number(numericWithFractionMatch[1]);
    if (Number.isFinite(base) && base > 0) {
      return base + 0.5;
    }
  }

  const decimalMatch = normalized.match(/(\d{1,3}(?:\.\d{1,2})?)/);
  if (decimalMatch) {
    const parsed = Number(decimalMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const fractionMatch = normalized.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      const fractionValue = numerator / denominator;
      if (fractionValue > 0) {
        return fractionValue;
      }
    }
  }

  const wordToNumber = {
    half: 0.5,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
  };

  const words = normalized.split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    const current = words[i];
    const currentValue = wordToNumber[current];
    if (!currentValue) {
      continue;
    }

    if (words[i + 1] === 'and' && words[i + 2] === 'a' && words[i + 3] === 'half') {
      return currentValue + 0.5;
    }

    if (words[i + 1] === 'and' && words[i + 2] === 'half') {
      return currentValue + 0.5;
    }

    return currentValue;
  }

  return 0.5;
};

const formatTabletCount = (count) => {
  const normalized = Number(count);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '0';
  }

  if (Math.abs(normalized - 0.5) < 0.001) {
    return '1/2';
  }

  if (Number.isInteger(normalized)) {
    return String(normalized);
  }

  return normalized.toFixed(1).replace(/\.0$/, '');
};

const isExpectedVoiceAbort = (event) => {
  const message = String(event?.message || event?.error || '').toLowerCase();
  const code = String(event?.code || '').toLowerCase();
  return (
    message.includes('aborted') ||
    message.includes('abort') ||
    message.includes('cancel') ||
    code.includes('abort') ||
    code.includes('cancel')
  );
};

const ScheduleBoardScreen = ({ onBack, user }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [routine, setRoutine] = useState(null);
  const [medications, setMedications] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [lastSavedStatusByEntry, setLastSavedStatusByEntry] = useState({});
  const [hiddenNextDoseEntries, setHiddenNextDoseEntries] = useState({});
  const [autoMarkingEntries, setAutoMarkingEntries] = useState({});
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceTargetEntryKey, setVoiceTargetEntryKey] = useState(null);
  const [showCustomRemindModal, setShowCustomRemindModal] = useState(false);
  const [customRemindMinutes, setCustomRemindMinutes] = useState(10);
  const [customRemindEntry, setCustomRemindEntry] = useState(null);
  const [showOverdoseModal, setShowOverdoseModal] = useState(false);
  const [overdoseTabletsCount, setOverdoseTabletsCount] = useState(0.5);
  const [overdoseEntry, setOverdoseEntry] = useState(null);
  const activeVoiceEntryRef = useRef(null);

  useEffect(() => {
    const loadScheduleData = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const [routineData, medicationData, todayStatusEvents] = await Promise.all([
          routineService.getRoutine(),
          medicationService.getMyMedications(),
          medicationService.getTodayLatestStatusEvents(),
        ]);

        setRoutine(routineData?.mealTimes || null);
        setMedications(medicationData || []);

        const latestStatusByEntry = {};
        (todayStatusEvents || []).forEach((eventItem) => {
          const key = `${eventItem?.medication_id || 'med'}-${eventItem?.schedule_slot || 'slot'}-${eventItem?.dose_number || 1}`;
          latestStatusByEntry[key] = {
            status: eventItem?.status || '',
            overdoseTablets: eventItem?.overdose_tablets == null ? null : Number(eventItem.overdose_tablets),
            savedAt: eventItem?.event_time ? new Date(eventItem.event_time) : new Date(),
          };
        });
        setLastSavedStatusByEntry(latestStatusByEntry);
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
          medicationId: medicine.id,
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

  const upcomingTodaySchedule = useMemo(
    () =>
      flatSchedule.filter((entry) => {
        if (!entry?.sortDate) {
          return false;
        }

        return entry.sortDate.getTime() >= currentTime.getTime();
      }),
    [flatSchedule, currentTime]
  );

  const nextDoseGroup = useMemo(() => {
    if (!flatSchedule.length) {
      return [];
    }

    const now = currentTime;
    const withFutureMarker = flatSchedule
      .map((item) => {
        const baseDate = item.sortDate;
        if (!baseDate) {
          return { ...item, dueDate: null, expiryDate: null, nextDate: null };
        }

        const dueDate = new Date(baseDate);
        const expiryDate = new Date(baseDate);
        expiryDate.setHours(expiryDate.getHours() + 1);

        const nextDate = new Date(baseDate);
        // Keep today's due item in the active list for a 1-hour grace period.
        if (now.getTime() > expiryDate.getTime()) {
          nextDate.setDate(nextDate.getDate() + 1);
        }

        return { ...item, dueDate, expiryDate, nextDate };
      })
      .filter((item) => !!item.nextDate)
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());

    const visibleCandidates = withFutureMarker.filter((entry) => !hiddenNextDoseEntries[getEntryDoseInstanceKey(entry)]);

    if (!visibleCandidates.length) {
      return [];
    }

    const firstTime = visibleCandidates[0].nextDate.getTime();
    return visibleCandidates.filter((item) => item.nextDate.getTime() === firstTime);
  }, [flatSchedule, currentTime, hiddenNextDoseEntries]);

  const nextDoseDisplayTime = useMemo(() => {
    const firstNextDose = nextDoseGroup[0];
    if (!firstNextDose) {
      return '--:--';
    }

    if (firstNextDose.reminderTimeLabel && firstNextDose.reminderTimeLabel !== '--:--') {
      return firstNextDose.reminderTimeLabel;
    }

    if (firstNextDose.routineTime) {
      return format12HourTime(firstNextDose.routineTime, currentTime);
    }

    return '--:--';
  }, [nextDoseGroup, currentTime]);

  const nextDoseEtaLabel = useMemo(
    () => formatEtaMinutes(nextDoseGroup[0]?.nextDate || null, currentTime),
    [nextDoseGroup, currentTime]
  );

  const visibleNextDoseGroup = nextDoseGroup;

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

  const speakScheduleDetails = (entry) => {
    if (!SpeechModule) {
      return;
    }

    const doseCount = Number(entry?.dailyAmount) || 1;
    const doseText = doseCount === 1 ? '1 tablet' : `${doseCount} tablets`;
    const colorText = entry?.color ? `Color ${entry.color}.` : 'Color not specified.';
    const shapeText = entry?.shape ? `Shape ${entry.shape}.` : 'Shape not specified.';
    const timingText = entry?.reminderRuleLabel ? `Reminder ${entry.reminderRuleLabel}.` : '';
    const slotText = entry?.rowLabel ? `Time slot ${entry.rowLabel}.` : '';
    const doseSequenceText = `Dose ${entry?.doseNumber || 1} of ${entry?.timesPerDay || 1} today.`;
    const message = [
      `${entry?.medicineName || 'Medicine'}.`,
      `${doseText} per intake.`,
      `${entry?.dosageMg || '--'} milligrams.`,
      colorText,
      shapeText,
      slotText,
      timingText,
      doseSequenceText,
    ]
      .filter(Boolean)
      .join(' ');

    SpeechModule.speak(message, {
      language: 'en',
      pitch: 1.0,
      rate: 0.95,
    });
  };

  const speakNextDoseGroup = () => {
    if (!SpeechModule || !visibleNextDoseGroup.length) {
      return;
    }

    const summary = visibleNextDoseGroup.map((entry) => {
      const doseCount = Number(entry?.dailyAmount) || 1;
      const doseText = doseCount === 1 ? '1 tablet' : `${doseCount} tablets`;
      return `${entry.medicineName}, ${entry.dosageMg} milligrams, ${doseText}, color ${entry.color || 'not specified'}, shape ${entry.shape || 'not specified'}.`;
    }).join(' ');

    const message = `Next dose time ${nextDoseDisplayTime}. ${summary}`;
    SpeechModule.speak(message, {
      language: 'en',
      pitch: 1.0,
      rate: 0.95,
    });
  };

  const handleHeaderSpeak = () => {
    if (nextDoseGroup.length) {
      speakNextDoseGroup();
      return;
    }

    if (!SpeechModule) {
      return;
    }

    SpeechModule.speak('No upcoming dose found right now.', {
      language: 'en',
      pitch: 1.0,
      rate: 0.95,
    });
  };

  const stopVoice = () => {
    if (!SpeechModule) {
      return;
    }

    SpeechModule.stop();
  };

  const speakSavedStatus = (statusKey, affectedCount, entries = []) => {
    if (!SpeechModule || !statusKey) {
      return;
    }

    const label = STATUS_LABELS[statusKey] || statusKey;
    const medicineWord = affectedCount === 1 ? 'medicine' : 'medicines';
    const names = entries
      .map((entry) => entry?.medicineName)
      .filter(Boolean)
      .join(', ');
    const namesText = names ? ` for ${names}` : '';

    SpeechModule.speak(`You selected ${label}${namesText}. Saved for ${affectedCount} ${medicineWord}.`, {
      language: 'en',
      pitch: 1.0,
      rate: 0.95,
    });
  };

  const buildVoiceMarkMessage = (statusKey, entry) => {
    const medicineName = entry?.medicineName ? `: ${entry.medicineName}.` : '.';

    if (statusKey === 'taken') {
      return `I taken this medicine${medicineName}`;
    }

    if (statusKey === 'overdose') {
      return `I got overdose this medicine${medicineName}`;
    }

    if (statusKey === 'remind') {
      return 'Remind me in 10 minutes.';
    }

    return `Medicine voice mark saved${medicineName}`;
  };

  const parseVoiceStatusCommand = (transcript, entry) => {
    if (!transcript || typeof transcript !== 'string') {
      return null;
    }

    const text = transcript.toLowerCase();

    if (text.includes('overdose')) {
      const overdoseCount = parseOverdoseTabletsFromVoiceText(text);
      return {
        statusKey: 'overdose',
        overdoseTablets: Number.isFinite(overdoseCount) && overdoseCount > 0 ? overdoseCount : 0.5,
        speakMessage: `I got ${formatTabletCount(overdoseCount)} overdose tablets for ${entry?.medicineName || 'this medicine'}.`,
      };
    }

    if (text.includes('remind') || text.includes('reminder') || text.includes('remember')) {
      const normalizedMinutes = parseMinutesFromVoiceText(text);
      return {
        statusKey: 'remind',
        remindAfterMinutes: normalizedMinutes,
        speakMessage: `Remind me in ${normalizedMinutes} minutes.`,
      };
    }

    if (text.includes('taken') || text.includes('take')) {
      return {
        statusKey: 'taken',
        speakMessage: buildVoiceMarkMessage('taken', entry),
      };
    }

    return null;
  };

  const handleSaveDoseStatus = async (entry, statusKey, options = {}) => {
    const bypassSavingLock = !!options?.forceSave;

    if (isSavingStatus && !bypassSavingLock) {
      return;
    }

    if (!entry?.medicationId) {
      Alert.alert('No dose', 'No medicine selected to mark right now.');
      return;
    }

    try {
      if (!bypassSavingLock) {
        setIsSavingStatus(true);
      }
      const eventTime = new Date().toISOString();

      if (statusKey === 'remind') {
        const remindAfterMinutes = Number(options?.remindAfterMinutes) || 10;
        await reminderNotificationService.scheduleReminderInMinutes({
          minutes: remindAfterMinutes,
          medication: {
            id: entry.medicationId,
            medicine_name: entry.medicineName,
          },
          message: `Reminder in ${remindAfterMinutes} minutes: ${entry.medicineName} ${entry.dosageMg}mg.`,
        });
      }

      await medicationService.saveMedicationStatusEvent({
        medicationId: entry.medicationId,
        status: statusKey,
        overdoseTablets: statusKey === 'overdose' ? Number(options?.overdoseTablets) || null : null,
        scheduleSlot: entry.rowKey,
        doseNumber: entry.doseNumber,
        timesPerDay: entry.timesPerDay,
        routineTime: entry.routineTime,
        reminderTime: entry.dueDate
          ? entry.dueDate.toISOString()
          : entry.nextDate
            ? entry.nextDate.toISOString()
            : null,
        eventTime,
      });

      const savedAt = new Date();
      setLastSavedStatusByEntry((prev) => ({
        ...prev,
        [getEntryStatusKey(entry)]: {
          status: statusKey,
          overdoseTablets: statusKey === 'overdose' ? Number(options?.overdoseTablets) || null : null,
          savedAt,
        },
      }));

      if (statusKey === 'not-taken') {
        setHiddenNextDoseEntries((prev) => ({
          ...prev,
          [getEntryDoseInstanceKey(entry)]: true,
        }));
      }

      if (options?.suppressAutoSpeak) {
        return;
      }

      if (options?.speakMessage && SpeechModule) {
        SpeechModule.speak(options.speakMessage, {
          language: 'en',
          pitch: 1.0,
          rate: 0.95,
        });
      } else {
        speakSavedStatus(statusKey, 1, [entry]);
      }
    } catch (error) {
      Alert.alert('Save failed', error?.response?.data?.error || error?.message || 'Could not save status.');
    } finally {
      if (!bypassSavingLock) {
        setIsSavingStatus(false);
      }
    }
  };

  const applyVoiceStatusCommandForEntry = async (entry, transcript) => {
    const parsed = parseVoiceStatusCommand(transcript, entry);

    if (!parsed) {
      Alert.alert(
        'Voice Not Recognized',
        'Try saying: I taken this medicine, I got overdose this medicine, or remind me in 10 minutes.'
      );
      return;
    }

    await handleSaveDoseStatus(entry, parsed.statusKey, {
      speakMessage: parsed.speakMessage,
      remindAfterMinutes: parsed.remindAfterMinutes,
      overdoseTablets: parsed.overdoseTablets,
    });
  };

  const openOverdoseTabletPicker = (entry) => {
    const countOptions = [0.5, 1, 1.5, 2, 3, 4, 5];
    const buttons = countOptions.map((tabletCount) => ({
      text: `${formatTabletCount(tabletCount)} tablet${tabletCount > 1 ? 's' : ''}`,
      onPress: () => {
        void handleSaveDoseStatus(entry, 'overdose', {
          overdoseTablets: tabletCount,
          speakMessage: `I got ${formatTabletCount(tabletCount)} overdose tablets for ${entry.medicineName}.`,
        });
      },
    }));

    buttons.push({
      text: 'Custom',
      onPress: () => {
        setOverdoseEntry(entry);
        setOverdoseTabletsCount(0.5);
        setShowOverdoseModal(true);
      },
    });

    buttons.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Overdose Count', 'How many tablets overdosed?', buttons, { cancelable: true });
  };

  const openRemindMinutePicker = (entry) => {
    const minuteOptions = [5, 10, 15, 30];
    const buttons = minuteOptions.map((minuteValue) => ({
      text: `${minuteValue} min`,
      onPress: () => {
        void handleSaveDoseStatus(entry, 'remind', {
          remindAfterMinutes: minuteValue,
          speakMessage: `Remind me in ${minuteValue} minutes.`,
        });
      },
    }));

    buttons.push({
      text: 'Custom',
      onPress: () => {
        setCustomRemindEntry(entry);
        setCustomRemindMinutes(10);
        setShowCustomRemindModal(true);
      },
    });

    buttons.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Set Reminder', 'Choose remind time', buttons, { cancelable: true });
  };

  useEffect(() => {
    // Keep hidden markers bounded to currently active schedule instances only.
    const now = currentTime;
    const activeKeys = new Set(
      flatSchedule
        .map((item) => {
          const baseDate = item.sortDate;
          if (!baseDate) {
            return null;
          }

          const dueDate = new Date(baseDate);
          const expiryDate = new Date(baseDate);
          expiryDate.setHours(expiryDate.getHours() + 1);

          const nextDate = new Date(baseDate);
          if (now.getTime() > expiryDate.getTime()) {
            nextDate.setDate(nextDate.getDate() + 1);
          }

          return getEntryDoseInstanceKey({ ...item, dueDate, nextDate });
        })
        .filter(Boolean)
    );

    setHiddenNextDoseEntries((prev) => {
      const next = {};
      Object.keys(prev).forEach((key) => {
        if (activeKeys.has(key)) {
          next[key] = prev[key];
        }
      });
      return next;
    });
  }, [flatSchedule, currentTime]);

  useEffect(() => {
    const handledStatuses = new Set(['taken', 'overdose', 'remind', 'not-taken']);

    const expiredEntries = flatSchedule
      .map((entry) => {
        const dueDate = entry?.sortDate ? new Date(entry.sortDate) : null;
        if (!dueDate) {
          return null;
        }

        const expiryDate = new Date(dueDate.getTime() + 60 * 60 * 1000);
        return {
          ...entry,
          dueDate,
          expiryDate,
          nextDate: dueDate,
        };
      })
      .filter(Boolean)
      .filter((entry) => {
        const instanceKey = getEntryDoseInstanceKey(entry);
        if (hiddenNextDoseEntries[instanceKey] || autoMarkingEntries[instanceKey]) {
          return false;
        }

        const entryState = lastSavedStatusByEntry[getEntryStatusKey(entry)];
        if (entryState?.status && handledStatuses.has(entryState.status)) {
          return false;
        }

        return currentTime.getTime() >= entry.expiryDate.getTime();
      });

    if (!expiredEntries.length) {
      return;
    }

    expiredEntries.forEach((entry) => {
      const instanceKey = getEntryDoseInstanceKey(entry);
      setAutoMarkingEntries((prev) => ({
        ...prev,
        [instanceKey]: true,
      }));

      void handleSaveDoseStatus(entry, 'not-taken', {
        suppressAutoSpeak: true,
        forceSave: true,
      })
        .finally(() => {
          setAutoMarkingEntries((prev) => {
            const next = { ...prev };
            delete next[instanceKey];
            return next;
          });
        });
    });
  }, [flatSchedule, hiddenNextDoseEntries, autoMarkingEntries, lastSavedStatusByEntry, currentTime]);

  const applyCustomRemindMinutes = async () => {
    if (!customRemindEntry) {
      setShowCustomRemindModal(false);
      return;
    }

    const minutes = Math.max(1, Number(customRemindMinutes) || 1);
    setShowCustomRemindModal(false);

    await handleSaveDoseStatus(customRemindEntry, 'remind', {
      remindAfterMinutes: minutes,
      speakMessage: `Remind me in ${minutes} minutes.`,
    });
  };

  const handleEntrySpeak = async (entry) => {
    if (!ExpoSpeechRecognitionModule || !ExpoEventEmitter) {
      Alert.alert('Voice Unavailable', 'Voice input is not available in this build.');
      return;
    }

    try {
      if (Platform.OS === 'web' && !ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        Alert.alert('Voice Not Available', 'Speech recognition is not available in this browser.');
        return;
      }

      if (isVoiceListening) {
        ExpoSpeechRecognitionModule.stop();
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission Needed', 'Microphone permission is required to use voice input.');
        return;
      }

      const entryKey = getEntryStatusKey(entry);
      activeVoiceEntryRef.current = entry;
      setVoiceTargetEntryKey(entryKey);
      setVoiceTranscript('');

      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
      });
    } catch (error) {
      Alert.alert('Voice Error', error?.message || 'Unable to start voice input.');
    }
  };

  useEffect(() => {
    if (!ExpoSpeechRecognitionModule || !ExpoEventEmitter) {
      return undefined;
    }

    const speechEventEmitter = new ExpoEventEmitter(ExpoSpeechRecognitionModule);

    const onStart = speechEventEmitter.addListener('start', () => {
      setIsVoiceListening(true);
    });

    const onEnd = speechEventEmitter.addListener('end', () => {
      setIsVoiceListening(false);
      setVoiceTargetEntryKey(null);
    });

    const onError = speechEventEmitter.addListener('error', (event) => {
      setIsVoiceListening(false);
      setVoiceTargetEntryKey(null);
      if (isExpectedVoiceAbort(event)) {
        return;
      }
      Alert.alert('Voice Error', event?.message || 'Voice recognition failed.');
    });

    const onResult = speechEventEmitter.addListener('result', (event) => {
      const latest = event?.results?.[0]?.transcript || '';
      if (latest) {
        setVoiceTranscript(latest);
      }

      if (event?.isFinal && latest) {
        const activeEntry = activeVoiceEntryRef.current;
        if (activeEntry) {
          void applyVoiceStatusCommandForEntry(activeEntry, latest);
        }
      }
    });

    return () => {
      onStart?.remove?.();
      onEnd?.remove?.();
      onError?.remove?.();
      onResult?.remove?.();
    };
  }, []);

  const getSavedStatusTextForEntry = (entry) => {
    const entryState = lastSavedStatusByEntry[getEntryStatusKey(entry)];
    if (!entryState) {
      return '';
    }

    const label = STATUS_LABELS[entryState.status] || entryState.status;
    const timeLabel = entryState.savedAt?.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    if (entryState.status === 'overdose' && entryState.overdoseTablets) {
      return `Saved: ${label} (${entryState.overdoseTablets} tablets) at ${timeLabel}`;
    }

    return `Saved: ${label} at ${timeLabel}`;
  };

  const isEntryInteractionLocked = (entry) => {
    const entryState = lastSavedStatusByEntry[getEntryStatusKey(entry)];
    const status = String(entryState?.status || '').toLowerCase();
    return status === 'taken' || status === 'overdose';
  };

  const applyCustomOverdoseCount = async () => {
    if (!overdoseEntry) {
      setShowOverdoseModal(false);
      return;
    }

    const tablets = Math.max(0.5, Number(overdoseTabletsCount) || 0.5);
    setShowOverdoseModal(false);

    await handleSaveDoseStatus(overdoseEntry, 'overdose', {
      overdoseTablets: tablets,
      speakMessage: `I got ${formatTabletCount(tablets)} overdose tablets for ${overdoseEntry.medicineName}.`,
    });
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Schedule Board</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerActionButton} onPress={handleHeaderSpeak}>
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

          {!!visibleNextDoseGroup.length && (
            <View style={styles.nextDoseGlobalActionRow}>
              <TouchableOpacity
                style={styles.nextDoseGlobalActionButton}
                onPress={speakNextDoseGroup}
                accessibilityLabel="Play next dose list"
              >
                <Text style={styles.nextDoseGlobalActionIcon}>▶</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextDoseGlobalActionButton}
                onPress={stopVoice}
                accessibilityLabel="Stop voice"
              >
                <Text style={styles.nextDoseGlobalActionIcon}>■</Text>
              </TouchableOpacity>
            </View>
          )}

          {visibleNextDoseGroup.length ? (
            visibleNextDoseGroup.map((entry) => {
              const isLocked = isEntryInteractionLocked(entry);

              return (
              <View key={`next-${entry.stableId}`} style={[styles.highlightMedicineRow, isLocked && styles.highlightMedicineRowLocked]}>
                <View style={[styles.highlightAppearance, { backgroundColor: getColorValue(entry.color) }]}>
                  <Text style={styles.highlightAppearanceIcon}>{getShapeIcon(entry.shape)}</Text>
                </View>
                <View style={styles.highlightTextWrap}>
                  <Text style={[styles.highlightMedicineName, isLocked && styles.highlightTextLocked]}>{entry.medicineName}</Text>
                  <Text style={[styles.highlightMedicineMeta, isLocked && styles.highlightTextLocked]}>{entry.dosageMg}mg</Text>
                  <Text style={[styles.highlightMedicineSubMeta, isLocked && styles.highlightTextLocked]}>
                    {entry.timesPerDay} {entry.timesPerDay === 1 ? 'time' : 'times'} / day
                  </Text>
                  <Text style={[styles.highlightMedicineDoseText, isLocked && styles.highlightTextLocked]}>
                    Dose {entry.doseNumber || 1} of {entry.timesPerDay || 1}
                  </Text>

                  <View style={styles.entryStatusRow}>
                    <TouchableOpacity
                      style={[styles.entryStatusButton, isLocked && styles.entryStatusButtonDisabled]}
                      onPress={() => handleSaveDoseStatus(entry, 'taken')}
                      disabled={isSavingStatus || isLocked}
                    >
                      <Text style={[styles.entryStatusButtonText, isLocked && styles.entryStatusButtonTextDisabled]}>Taken</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.entryStatusButton, isLocked && styles.entryStatusButtonDisabled]}
                      onPress={() => openRemindMinutePicker(entry)}
                      disabled={isSavingStatus || isLocked}
                    >
                      <Text style={[styles.entryStatusButtonText, isLocked && styles.entryStatusButtonTextDisabled]}>Remind</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.entryStatusButton, styles.entryStatusButtonDanger, isLocked && styles.entryStatusButtonDisabled]}
                      onPress={() => openOverdoseTabletPicker(entry)}
                      disabled={isSavingStatus || isLocked}
                    >
                      <Text style={[styles.entryStatusButtonText, isLocked && styles.entryStatusButtonTextDisabled]}>Overdose</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.entryActionRow}>
                    <TouchableOpacity
                      style={[styles.entryActionButton, isLocked && styles.entryActionButtonDisabled]}
                      onPress={() => handleEntrySpeak(entry)}
                      disabled={isLocked}
                    >
                      <Text style={[styles.entryActionButtonText, isLocked && styles.entryActionButtonTextDisabled]}>
                        {isVoiceListening && voiceTargetEntryKey === getEntryStatusKey(entry) ? 'Listening...' : 'Speak'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {!!(isVoiceListening && voiceTargetEntryKey === getEntryStatusKey(entry) && voiceTranscript) && (
                    <Text style={styles.entryVoiceText}>Heard: {voiceTranscript}</Text>
                  )}

                  {!!getSavedStatusTextForEntry(entry) && (
                    <Text style={styles.entrySavedStatusText}>{getSavedStatusTextForEntry(entry)}</Text>
                  )}
                </View>
              </View>
            );})
          ) : (
            <View style={styles.noNextDoseWrap}>
              <Text style={styles.noNextDoseText}>No upcoming dose found.</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Upcoming Schedules Today</Text>
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{upcomingTodaySchedule.length} total</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#2f8fd0" />
            <Text style={styles.loaderText}>Loading daily schedule...</Text>
          </View>
        ) : null}

        {!isLoading && !!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        {!isLoading && !errorMessage && upcomingTodaySchedule.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No upcoming schedules for today</Text>
            <Text style={styles.emptyText}>All scheduled reminders for today are already completed or passed.</Text>
          </View>
        )}

        {!isLoading && !errorMessage && upcomingTodaySchedule.map((entry) => (
          <TouchableOpacity
            key={entry.stableId}
            style={styles.scheduleItemCard}
            activeOpacity={0.9}
            onPress={() => speakScheduleDetails(entry)}
          >
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

      {showCustomRemindModal && (
        <View style={styles.customRemindOverlay}>
          <View style={styles.customRemindCard}>
            <Text style={styles.customRemindTitle}>Custom Reminder</Text>
            <Text style={styles.customRemindSubtitle}>Set reminder after how many minutes</Text>

            <View style={styles.customRemindStepperRow}>
              <TouchableOpacity
                style={styles.customRemindStepperButton}
                onPress={() => setCustomRemindMinutes((prev) => Math.max(1, prev - 1))}
              >
                <Text style={styles.customRemindStepperButtonText}>-</Text>
              </TouchableOpacity>

              <Text style={styles.customRemindMinuteValue}>{customRemindMinutes} min</Text>

              <TouchableOpacity
                style={styles.customRemindStepperButton}
                onPress={() => setCustomRemindMinutes((prev) => Math.min(240, prev + 1))}
              >
                <Text style={styles.customRemindStepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.customRemindActionRow}>
              <TouchableOpacity
                style={styles.customRemindCancelButton}
                onPress={() => setShowCustomRemindModal(false)}
              >
                <Text style={styles.customRemindCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.customRemindSetButton}
                onPress={() => {
                  void applyCustomRemindMinutes();
                }}
              >
                <Text style={styles.customRemindSetButtonText}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showOverdoseModal && (
        <View style={styles.customRemindOverlay}>
          <View style={styles.customRemindCard}>
            <Text style={styles.customRemindTitle}>Overdose Count</Text>
            <Text style={styles.customRemindSubtitle}>Set number of tablets overdosed</Text>

            <View style={styles.customRemindStepperRow}>
              <TouchableOpacity
                style={styles.customRemindStepperButton}
                onPress={() => setOverdoseTabletsCount((prev) => Math.max(0.5, Number((prev - 0.5).toFixed(1))))}
              >
                <Text style={styles.customRemindStepperButtonText}>-</Text>
              </TouchableOpacity>

              <Text style={styles.customRemindMinuteValue}>{formatTabletCount(overdoseTabletsCount)} tablets</Text>

              <TouchableOpacity
                style={styles.customRemindStepperButton}
                onPress={() => setOverdoseTabletsCount((prev) => Math.min(99, Number((prev + 0.5).toFixed(1))))}
              >
                <Text style={styles.customRemindStepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.customRemindActionRow}>
              <TouchableOpacity
                style={styles.customRemindCancelButton}
                onPress={() => setShowOverdoseModal(false)}
              >
                <Text style={styles.customRemindCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.customRemindSetButton}
                onPress={() => {
                  void applyCustomOverdoseCount();
                }}
              >
                <Text style={styles.customRemindSetButtonText}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
  highlightMedicineRowLocked: {
    backgroundColor: '#eef2f5',
    borderWidth: 1,
    borderColor: '#d9e0e6',
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
  highlightTextLocked: {
    color: '#7d8b96',
  },
  entryStatusRow: {
    flexDirection: 'row',
    columnGap: 6,
    marginTop: 8,
  },
  entryStatusButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#5a8fb7',
    paddingVertical: 8,
    alignItems: 'center',
  },
  entryStatusButtonDanger: {
    backgroundColor: '#cf4e3f',
  },
  entryStatusButtonDisabled: {
    backgroundColor: '#b6c0c8',
  },
  entryStatusButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  entryStatusButtonTextDisabled: {
    color: '#eef2f5',
  },
  entryActionRow: {
    flexDirection: 'row',
    columnGap: 6,
    marginTop: 6,
  },
  entryActionButton: {
    flex: 0.45,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d2dfeb',
    paddingVertical: 8,
    alignItems: 'center',
  },
  entryActionButtonDisabled: {
    backgroundColor: '#edf1f4',
    borderColor: '#d4dce3',
  },
  entryActionButtonText: {
    color: '#2f3c49',
    fontSize: 12,
    fontWeight: '700',
  },
  entryActionButtonTextDisabled: {
    color: '#7e8b95',
  },
  entrySavedStatusText: {
    marginTop: 6,
    fontSize: 11,
    color: '#2f5f7f',
    fontWeight: '600',
  },
  entryVoiceText: {
    marginTop: 4,
    fontSize: 11,
    color: '#2e6288',
    fontWeight: '600',
  },
  nextDoseGlobalActionRow: {
    flexDirection: 'row',
    columnGap: 8,
    marginBottom: 8,
  },
  nextDoseGlobalActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c6d9ea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextDoseGlobalActionIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2f3c49',
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
  customRemindOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(16, 24, 32, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  customRemindCard: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d4e0ec',
    padding: 14,
  },
  customRemindTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#223140',
  },
  customRemindSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#62788e',
  },
  customRemindStepperRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 12,
  },
  customRemindStepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#edf4fb',
    borderWidth: 1,
    borderColor: '#d3e2f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customRemindStepperButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2f4f67',
    marginTop: -1,
  },
  customRemindMinuteValue: {
    minWidth: 95,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#1f3141',
  },
  customRemindActionRow: {
    marginTop: 16,
    flexDirection: 'row',
    columnGap: 10,
  },
  customRemindCancelButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8e2ec',
    backgroundColor: '#f5f8fb',
    paddingVertical: 10,
    alignItems: 'center',
  },
  customRemindCancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#53697d',
  },
  customRemindSetButton: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#2e8ce7',
    paddingVertical: 10,
    alignItems: 'center',
  },
  customRemindSetButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
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
