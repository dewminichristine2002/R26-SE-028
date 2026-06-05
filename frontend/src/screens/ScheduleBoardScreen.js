import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { intakeMonitoringService } from '../services/intakeMonitoringService';
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

const getTakeTimeRuleLabel = (timingValue = '') => {
  const normalized = String(timingValue || '').toLowerCase();
  if (normalized.includes('before')) {
    return 'Before meal -30 mins';
  }
  return 'After meal +30 mins';
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

const formatDatePeriod = (dateValue) => {
  if (!dateValue) {
    return '';
  }

  return dateValue.toLocaleTimeString([], {
    hour: '2-digit',
    hour12: true,
  }).replace(/\d|\s|:/g, '');
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

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    const hourText = hours === 1 ? '1 hr' : `${hours} hrs`;
    const minuteText = remainingMinutes === 1 ? '1 min' : `${remainingMinutes} min`;
    return remainingMinutes > 0 ? `in ${hourText} ${minuteText}` : `in ${hourText}`;
  }

  return minutes === 1 ? 'in 1 min' : `in ${minutes} min`;
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

const getVerificationEntries = (entry) => {
  if (Array.isArray(entry?.entries) && entry.entries.length) {
    return entry.entries;
  }
  return entry ? [entry] : [];
};

const getExpectedTabletCount = (entry) => {
  const entries = getVerificationEntries(entry);
  if (entries.length > 1 || entry?.isGroupIntake) {
    return entries.reduce((total, item) => total + (Number(item?.dailyAmount) || 1), 0);
  }
  return Math.max(0.5, Number(entry?.dailyAmount) || 1);
};

const getCountComparisonStatus = (count, expectedCount) => {
  const normalizedCount = Number(count);
  const normalizedExpected = Number(expectedCount);
  if (!Number.isFinite(normalizedCount) || normalizedCount <= 0 || !Number.isFinite(normalizedExpected) || normalizedExpected <= 0) {
    return 'unknown';
  }
  if (Math.abs(normalizedCount - normalizedExpected) <= 0.001) {
    return 'okay';
  }
  return normalizedCount > normalizedExpected ? 'overdose' : 'underdose';
};

const getCountComparisonLabel = (status) => {
  if (status === 'okay') {
    return 'Count OK';
  }
  if (status === 'overdose') {
    return 'Overdose count';
  }
  if (status === 'underdose') {
    return 'Underdose count';
  }
  return 'Count uncertain';
};

const getCountComparisonMessage = (status, count, expectedCount) => {
  const expectedText = formatTabletCount(expectedCount);
  const countText = formatTabletCount(count);
  if (status === 'okay') {
    return `Count is correct: ${countText} tablet${Number(count) === 1 ? '' : 's'}.`;
  }
  if (status === 'overdose') {
    return `Overdose: detected ${countText}, expected ${expectedText}.`;
  }
  if (status === 'underdose') {
    return `Underdose: detected ${countText}, expected ${expectedText}.`;
  }
  return `Expected ${expectedText} tablet${Number(expectedCount) === 1 ? '' : 's'}.`;
};

const getIntakeAmountText = (entry) => {
  const tabletCount = Number(entry?.dailyAmount) || 1;
  const formattedCount = formatTabletCount(tabletCount);
  const unit = tabletCount === 1 ? 'tablet' : 'tablets';
  return `💊 Take ${formattedCount} ${unit} for this intake`;
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

const ScheduleBoardScreen = ({ onBack, user, reminderTextScale = 1 }) => {
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
  const [intakeVerificationEntry, setIntakeVerificationEntry] = useState(null);
  const [intakeVerificationPhotoUri, setIntakeVerificationPhotoUri] = useState('');
  const [intakeVerificationPhotoBase64, setIntakeVerificationPhotoBase64] = useState('');
  const [detectedTabletCount, setDetectedTabletCount] = useState(null);
  const [tabletCountAnalysisMessage, setTabletCountAnalysisMessage] = useState('');
  const [isAnalyzingTabletCount, setIsAnalyzingTabletCount] = useState(false);
  const [verifiedTabletCount, setVerifiedTabletCount] = useState(1);
  const [verificationHandToMouth, setVerificationHandToMouth] = useState(false);
  const [verificationSwallowComplete, setVerificationSwallowComplete] = useState(false);
  const [verificationSpeakMessage, setVerificationSpeakMessage] = useState('');
  const [isOpeningVerificationCamera, setIsOpeningVerificationCamera] = useState(false);
  const [isAnalyzingMotionVideo, setIsAnalyzingMotionVideo] = useState(false);
  const [motionVideoUri, setMotionVideoUri] = useState('');
  const [motionAnalysisMessage, setMotionAnalysisMessage] = useState('');
  const [showFullDay, setShowFullDay] = useState(true);
  const activeVoiceEntryRef = useRef(null);
  const textScale = reminderTextScale || 1;

  const renderAppearanceIcon = (shape, color, isLarge = false) => {
    const normalizedShape = String(shape || '').trim().toLowerCase();
    const resolvedColor = getColorValue(color);
    const isTriangle = normalizedShape === 'triangle';
    const shapeStyle = [
      styles.pillShape,
      isLarge && styles.pillShapeLarge,
      ['round', 'circle'].includes(normalizedShape) && styles.pillShapeRound,
      normalizedShape === 'oval' && styles.pillShapeOval,
      ['capsule', 'oblong'].includes(normalizedShape) && styles.pillShapeCapsule,
      ['tablet', 'square'].includes(normalizedShape) && styles.pillShapeSquare,
      normalizedShape === 'diamond' && styles.pillShapeDiamond,
      { backgroundColor: resolvedColor },
    ];

    return (
      <View style={[styles.appearanceIconFrame, isLarge && styles.appearanceIconFrameLarge]}>
        {isTriangle ? (
          <Text style={[styles.pillShapeTriangle, isLarge && styles.pillShapeTriangleLarge, { color: resolvedColor }]}>▲</Text>
        ) : (
          <View style={shapeStyle} />
        )}
      </View>
    );
  };

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
            const offsetMinutes = getReminderOffsetMinutes(item.timing);
            const takeDate = applyMinutesOffset(baseDate, offsetMinutes) || baseDate;
            const takeRuleLabel = getTakeTimeRuleLabel(item.timing);

            return {
              ...item,
              rowKey: row.slotKey,
              rowLabel: row.slotLabel,
              rowShort: formatDatePeriod(takeDate) || SLOT_SHORT_LABELS[row.slotKey] || 'AM',
              routineTime: row.time,
              mealTimeLabel: format12HourTime(row.time, currentTime),
              reminderTime: takeDate,
              reminderTimeLabel: formatDateTo12Hour(takeDate),
              tabletTime: takeDate,
              tabletTimeLabel: formatDateTo12Hour(takeDate),
              tabletPeriodLabel: formatDatePeriod(takeDate) || SLOT_SHORT_LABELS[row.slotKey] || 'AM',
              reminderRuleLabel: takeRuleLabel,
              sortDate: takeDate,
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

    if (firstNextDose.tabletTimeLabel && firstNextDose.tabletTimeLabel !== '--:--') {
      return firstNextDose.tabletTimeLabel;
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

  const nextDoseIntakeSummary = useMemo(() => {
    const medicineCount = visibleNextDoseGroup.length;
    const tabletCount = visibleNextDoseGroup.reduce((total, entry) => total + (Number(entry?.dailyAmount) || 1), 0);

    return {
      medicineCount,
      tabletCount,
      medicineLabel: medicineCount === 1 ? 'medicine' : 'medicines',
      tabletLabel: tabletCount === 1 ? 'tablet' : 'tablets',
    };
  }, [visibleNextDoseGroup]);

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
    const message = [
      `${entry?.medicineName || 'Medicine'}.`,
      `${doseText} per intake.`,
      `${entry?.dosageMg || '--'} milligrams.`,
      colorText,
      shapeText,
      slotText,
      timingText,
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

  const handleSaveDoseGroupTaken = async (entries, options = {}) => {
    const activeEntries = (entries || []).filter((entry) => entry?.medicationId);
    if (!activeEntries.length) {
      Alert.alert('No dose', 'No medicines selected to mark right now.');
      return;
    }

    if (isSavingStatus) {
      return;
    }

    try {
      setIsSavingStatus(true);
      const eventTime = new Date().toISOString();

      await Promise.all(
        activeEntries.map((entry) =>
          medicationService.saveMedicationStatusEvent({
            medicationId: entry.medicationId,
            status: 'taken',
            overdoseTablets: null,
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
          })
        )
      );

      const savedAt = new Date();
      setLastSavedStatusByEntry((prev) => {
        const next = { ...prev };
        activeEntries.forEach((entry) => {
          next[getEntryStatusKey(entry)] = {
            status: 'taken',
            overdoseTablets: null,
            savedAt,
          };
        });
        return next;
      });

      if (options?.speakMessage && SpeechModule) {
        SpeechModule.speak(options.speakMessage, {
          language: 'en',
          pitch: 1.0,
          rate: 0.95,
        });
      } else {
        speakSavedStatus('taken', activeEntries.length, activeEntries);
      }
    } catch (error) {
      Alert.alert('Save failed', error?.response?.data?.error || error?.message || 'Could not save statuses.');
    } finally {
      setIsSavingStatus(false);
    }
  };

  const resetIntakeVerification = () => {
    setIntakeVerificationEntry(null);
    setIntakeVerificationPhotoUri('');
    setIntakeVerificationPhotoBase64('');
    setDetectedTabletCount(null);
    setTabletCountAnalysisMessage('');
    setIsAnalyzingTabletCount(false);
    setVerifiedTabletCount(1);
    setVerificationHandToMouth(false);
    setVerificationSwallowComplete(false);
    setVerificationSpeakMessage('');
    setIsOpeningVerificationCamera(false);
    setIsAnalyzingMotionVideo(false);
    setMotionVideoUri('');
    setMotionAnalysisMessage('');
  };

  const analyzePalmPhoto = async (entry, imageBase64) => {
    if (!entry || !imageBase64) {
      return;
    }

    try {
      setIsAnalyzingTabletCount(true);
      setTabletCountAnalysisMessage('Counting tablets from the palm photo...');
      const expectedCount = getExpectedTabletCount(entry);
      const analysis = await intakeMonitoringService.analyzePalmPhoto({
        imageBase64,
        expectedCount,
      });
      const count = Number(analysis?.detectedCount);
      if (Number.isFinite(count) && count > 0) {
        setDetectedTabletCount(count);
        setVerifiedTabletCount(count);
        const confidenceText = Number.isFinite(Number(analysis?.confidence))
          ? ` (${Math.round(Number(analysis.confidence) * 100)}% confidence)`
          : '';
        const comparisonStatus = analysis?.status || getCountComparisonStatus(count, expectedCount);
        const modelConfidence = Number(analysis?.modelAnalysis?.confidence) || 0;
        const modelThreshold = Number(analysis?.modelAnalysis?.confidenceThreshold) || 0.7;
        const isAiCountSource = analysis?.countSource === 'ai-model'
          || analysis?.countSource === 'pill-detector'
          || String(analysis?.countSource || '').startsWith('hybrid');
        const modelText = analysis?.modelAnalysis?.available && analysis?.countSource !== 'ai-model' && modelConfidence >= modelThreshold
          ? analysis?.modelAnalysis?.agreement === false
            ? ` AI model estimated ${formatTabletCount(analysis.modelAnalysis.count)}. Please confirm.`
            : ' AI model confirmed.'
          : isAiCountSource
          ? ' AI model confirmed.'
          : '';
        const sourceText = analysis?.countSource === 'image-processing'
          ? ' Image processing fallback used.'
          : '';
        setTabletCountAnalysisMessage(
          `${getCountComparisonMessage(comparisonStatus, count, expectedCount)}${modelText}${confidenceText}.${sourceText}`
        );
      } else {
        setDetectedTabletCount(0);
        setTabletCountAnalysisMessage(analysis?.error || 'Could not clearly count tablets. Retake the palm photo with all tablets separated.');
      }
    } catch (error) {
      setDetectedTabletCount(null);
      setTabletCountAnalysisMessage(error?.response?.data?.error || error?.message || 'Could not analyze photo. Retake the palm photo with all tablets separated.');
    } finally {
      setIsAnalyzingTabletCount(false);
    }
  };

  const captureIntakeVerificationPhoto = async (entryOverride = intakeVerificationEntry) => {
    try {
      setIsOpeningVerificationCamera(true);
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Needed', 'Camera permission is required to verify this intake.');
        return;
      }

      const pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.75,
        base64: true,
      });

      if (!pickerResult.canceled && pickerResult.assets?.length) {
        const asset = pickerResult.assets[0];
        setIntakeVerificationPhotoUri(asset?.uri || '');
        setIntakeVerificationPhotoBase64(asset?.base64 || '');
        setDetectedTabletCount(null);
        setTabletCountAnalysisMessage('');
        await analyzePalmPhoto(entryOverride, asset?.base64 || '');
      }
    } catch (error) {
      Alert.alert('Camera Error', error?.message || 'Could not open camera.');
    } finally {
      setIsOpeningVerificationCamera(false);
    }
  };

  const openIntakeVerification = (entry, options = {}) => {
    if (!entry?.medicationId) {
      Alert.alert('No dose', 'No medicine selected to verify right now.');
      return;
    }

    const expectedCount = getExpectedTabletCount(entry);
    setIntakeVerificationEntry(entry);
    setIntakeVerificationPhotoUri('');
    setVerifiedTabletCount(expectedCount);
    setVerificationHandToMouth(false);
    setVerificationSwallowComplete(false);
    setVerificationSpeakMessage(options?.speakMessage || '');
    setDetectedTabletCount(null);
    setTabletCountAnalysisMessage('');
    setIntakeVerificationPhotoBase64('');
    setMotionVideoUri('');
    setMotionAnalysisMessage('');
    void captureIntakeVerificationPhoto(entry);
  };

  const getFileExtensionFromUri = (uri = '') => {
    const cleanUri = String(uri || '').split('?')[0];
    const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
    return match?.[1]?.toLowerCase() || 'mp4';
  };

  const recordAndAnalyzeIntakeMotion = async () => {
    try {
      setIsAnalyzingMotionVideo(true);
      setVerificationHandToMouth(false);
      setMotionAnalysisMessage('Opening camera for intake motion...');

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Needed', 'Camera permission is required to verify intake motion.');
        return;
      }

      const pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        cameraType: ImagePicker.CameraType?.front || 'front',
        videoMaxDuration: 8,
        quality: 0.7,
      });

      if (pickerResult.canceled || !pickerResult.assets?.length) {
        setVerificationHandToMouth(false);
        setMotionAnalysisMessage('');
        return;
      }

      const asset = pickerResult.assets[0];
      const uri = asset?.uri || '';
      if (!uri) {
        setVerificationHandToMouth(false);
        setMotionAnalysisMessage('Could not read motion video. Please try again.');
        return;
      }

      setMotionVideoUri(uri);
      setMotionAnalysisMessage('Analyzing hand-to-mouth motion...');
      const videoBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const analysis = await intakeMonitoringService.analyzeMotionVideo({
        videoBase64,
        extension: getFileExtensionFromUri(uri),
        swallowConfirmed: verificationSwallowComplete,
      });

      const motionAvailable = analysis?.motionAvailable ?? (!!analysis?.handToMouthDetected && !!analysis?.mouthPauseDetected);
      setVerificationHandToMouth(!!motionAvailable);

      const confidenceText = Number.isFinite(Number(analysis?.confidence))
        ? ` (${Math.round(Number(analysis.confidence) * 100)}% confidence)`
        : '';
      if (motionAvailable) {
        setMotionAnalysisMessage(`Camera detected hand-to-mouth intake motion${confidenceText}.`);
      } else {
        const frameHint = analysis?.extractionMode === 'opencv-motion-fallback'
          ? ` Motion frames: ${analysis?.handFrameCount || 0}. Face frames: ${analysis?.faceFrameCount || 0}.`
          : '';
        setMotionAnalysisMessage(
          analysis?.message ||
            analysis?.error ||
            `Motion not clear${confidenceText}.${frameHint} Record again with face, hand, and mouth visible.`
        );
      }
    } catch (error) {
      setVerificationHandToMouth(false);
      setMotionAnalysisMessage(
        error?.response?.data?.error ||
          error?.message ||
          'Could not analyze intake motion. Record again with face and hand visible.'
      );
    } finally {
      setIsAnalyzingMotionVideo(false);
    }
  };

  const openOneTimeIntakeVerification = () => {
    const entries = visibleNextDoseGroup.filter((entry) => !isEntryInteractionLocked(entry));
    if (!entries.length) {
      Alert.alert('No dose', 'No unmarked medicines are ready for one-time verification.');
      return;
    }

    const expectedCount = entries.reduce((total, entry) => total + (Number(entry?.dailyAmount) || 1), 0);
    const groupEntry = {
      isGroupIntake: true,
      entries,
      medicineName: 'Current intake',
      dosageMg: '',
      dailyAmount: expectedCount,
      color: '',
      shape: '',
      rowLabel: entries[0]?.rowLabel,
      rowKey: entries[0]?.rowKey,
      dueDate: entries[0]?.dueDate,
      nextDate: entries[0]?.nextDate,
      routineTime: entries[0]?.routineTime,
    };

    setIntakeVerificationEntry(groupEntry);
    setIntakeVerificationPhotoUri('');
    setVerifiedTabletCount(expectedCount);
    setVerificationHandToMouth(false);
    setVerificationSwallowComplete(false);
    setVerificationSpeakMessage(`I got all medicines for ${entries.length} medicines.`);
    setDetectedTabletCount(null);
    setTabletCountAnalysisMessage('');
    setIntakeVerificationPhotoBase64('');
    setMotionVideoUri('');
    setMotionAnalysisMessage('');
    void captureIntakeVerificationPhoto(groupEntry);
  };

  const completeIntakeVerification = async () => {
    const entry = intakeVerificationEntry;
    if (!entry) {
      resetIntakeVerification();
      return;
    }

    const expectedCount = getExpectedTabletCount(entry);
    if (!intakeVerificationPhotoUri) {
      Alert.alert('Palm Photo Needed', 'Please take a photo showing the tablets in your palm first.');
      return;
    }

    if (Math.abs(Number(verifiedTabletCount) - expectedCount) > 0.001) {
      Alert.alert(
        'Incorrect Count',
        `This intake needs ${formatTabletCount(expectedCount)} tablet${expectedCount === 1 ? '' : 's'}, but the verified count is ${formatTabletCount(verifiedTabletCount)}.`
      );
      return;
    }

    if (!verificationHandToMouth) {
      Alert.alert('Camera Motion Needed', 'Please record the intake motion first. Mark Taken unlocks only after hand-to-mouth motion is detected in the video.');
      return;
    }

    const speakMessage = verificationSpeakMessage;
    const verificationEntries = getVerificationEntries(entry);
    resetIntakeVerification();
    if (entry?.isGroupIntake || verificationEntries.length > 1) {
      await handleSaveDoseGroupTaken(verificationEntries, { speakMessage });
      return;
    }

    await handleSaveDoseStatus(entry, 'taken', { speakMessage });
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

  if (intakeVerificationEntry) {
    const expectedCount = getExpectedTabletCount(intakeVerificationEntry);
    const countMatches = Math.abs(Number(verifiedTabletCount) - expectedCount) <= 0.001;
    const countStatus = getCountComparisonStatus(verifiedTabletCount, expectedCount);
    const verificationEntries = getVerificationEntries(intakeVerificationEntry);
    const isGroupVerification = intakeVerificationEntry?.isGroupIntake || verificationEntries.length > 1;
    const motionDetected = !!verificationHandToMouth && !isAnalyzingMotionVideo;
    const canMarkTaken = !!intakeVerificationPhotoUri && countMatches && motionDetected;

    return (
      <View style={styles.page}>
        <View style={styles.staticHeaderWrap}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={resetIntakeVerification}>
              <Text style={styles.backIcon}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>Intake Check</Text>
            <View style={styles.headerRightSpacer} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.verificationContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.verificationHeroCard}>
            <Text style={[styles.verificationHeroTitle, { fontSize: 24 * textScale, lineHeight: 30 * textScale }]}>
              {isGroupVerification ? 'Verify one-time intake' : 'Verify before marking taken'}
            </Text>
            <Text style={[styles.verificationHeroText, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>
              Show all tablets in your palm. The trained AI model checks whether the amount is OK, overdose, or underdose.
            </Text>
          </View>

          <View style={styles.verificationMedicineCard}>
            {!isGroupVerification && (
              <View style={styles.verificationAppearanceWrap}>
                {renderAppearanceIcon(intakeVerificationEntry.shape, intakeVerificationEntry.color, true)}
              </View>
            )}
            <View style={styles.verificationMedicineTextWrap}>
              <Text style={[styles.verificationMedicineName, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>
                {isGroupVerification ? 'All medicines for this time' : intakeVerificationEntry.medicineName}
              </Text>
              {isGroupVerification ? (
                <Text style={[styles.verificationMedicineMeta, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>
                  {verificationEntries.length} medicine{verificationEntries.length === 1 ? '' : 's'} - Need {formatTabletCount(expectedCount)} tablet{expectedCount === 1 ? '' : 's'} total
                </Text>
              ) : (
                <Text style={[styles.verificationMedicineMeta, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>
                  {intakeVerificationEntry.dosageMg}mg - Need {formatTabletCount(expectedCount)} tablet{expectedCount === 1 ? '' : 's'}
                </Text>
              )}
              {isGroupVerification && (
                <View style={styles.verificationMedicineList}>
                  {verificationEntries.map((entry) => (
                    <Text key={entry.stableId || getEntryStatusKey(entry)} style={[styles.verificationMedicineListText, { fontSize: 13 * textScale, lineHeight: 18 * textScale }]}>
                      {entry.medicineName}: {formatTabletCount(Number(entry?.dailyAmount) || 1)} tablet{Number(entry?.dailyAmount) === 1 ? '' : 's'}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={styles.verificationStepCard}>
            <Text style={[styles.verificationStepTitle, { fontSize: 17 * textScale }]}>1. Palm photo</Text>
            {!!intakeVerificationPhotoUri ? (
              <Image source={{ uri: intakeVerificationPhotoUri }} style={styles.verificationPhoto} resizeMode="cover" />
            ) : (
              <View style={styles.verificationPhotoPlaceholder}>
                <Text style={styles.verificationPhotoPlaceholderText}>No photo captured</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.verificationCameraButton}
              onPress={captureIntakeVerificationPhoto}
              disabled={isOpeningVerificationCamera}
            >
              {isOpeningVerificationCamera ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.verificationCameraButtonText}>
                  {intakeVerificationPhotoUri ? 'Retake Photo' : 'Open Camera'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.verificationStepCard}>
            <Text style={[styles.verificationStepTitle, { fontSize: 17 * textScale }]}>2. AI tablet count</Text>
            <Text style={[styles.verificationStepText, { fontSize: 14 * textScale, lineHeight: 20 * textScale }]}>
              The system counts tablet-like objects from the palm photo and compares the count with this intake.
            </Text>
            <View style={styles.verificationAnalysisBox}>
              {isAnalyzingTabletCount ? (
                <View style={styles.verificationAnalysisRow}>
                  <ActivityIndicator color="#2f5d50" size="small" />
                  <Text style={styles.verificationAnalysisText}>Analyzing palm photo...</Text>
                </View>
              ) : (
                <Text style={styles.verificationAnalysisText}>
                  {tabletCountAnalysisMessage || 'Take a palm photo to estimate the tablet count.'}
                </Text>
              )}
              {detectedTabletCount != null && (
                <Text style={styles.verificationAnalysisMeta}>
                  AI count: {formatTabletCount(detectedTabletCount)} - {getCountComparisonLabel(getCountComparisonStatus(detectedTabletCount, expectedCount))}
                </Text>
              )}
            </View>
            <View style={styles.verificationCountRow}>
              <View style={[styles.verificationCountValue, countMatches ? styles.verificationCountValueGood : styles.verificationCountValueBad]}>
                <Text style={[styles.verificationCountValueText, { fontSize: 22 * textScale }]}>
                  {formatTabletCount(verifiedTabletCount)}
                </Text>
              </View>
            </View>
            <Text style={styles.verificationReadOnlyCountText}>Retake the photo to refresh this count.</Text>
            <Text style={[styles.verificationCountStatus, countMatches ? styles.verificationCountStatusGood : styles.verificationCountStatusBad]}>
              {getCountComparisonMessage(countStatus, verifiedTabletCount, expectedCount)}
            </Text>
          </View>

          <View style={styles.verificationStepCard}>
            <Text style={[styles.verificationStepTitle, { fontSize: 17 * textScale }]}>3. Camera intake motion</Text>
            <Text style={[styles.verificationStepText, { fontSize: 14 * textScale, lineHeight: 20 * textScale }]}>
              Record a short video with your face, hand, and mouth visible. The camera check detects hand-to-mouth motion.
            </Text>
            <TouchableOpacity
              style={[styles.verificationCameraButton, isAnalyzingMotionVideo && styles.verificationCompleteButtonDisabled]}
              onPress={recordAndAnalyzeIntakeMotion}
              disabled={isAnalyzingMotionVideo}
            >
              {isAnalyzingMotionVideo ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.verificationCameraButtonText}>
                  {motionVideoUri ? 'Record Again' : 'Record Motion'}
                </Text>
              )}
            </TouchableOpacity>
            <View style={[styles.verificationCheckRow, verificationHandToMouth && styles.verificationCheckRowActive]}>
              <Text style={styles.verificationCheckIcon}>{verificationHandToMouth ? '✓' : '○'}</Text>
              <Text style={[styles.verificationCheckText, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>
                Camera detected hand-to-mouth motion
              </Text>
            </View>
            {!verificationHandToMouth && !isAnalyzingMotionVideo && (
              <Text style={styles.verificationReadOnlyCountText}>Mark Taken unlocks after this camera motion check passes.</Text>
            )}
            {!!motionAnalysisMessage && (
              <Text style={[styles.verificationAnalysisMeta, !verificationHandToMouth && styles.verificationCountStatusBad]}>
                {motionAnalysisMessage}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.verificationCompleteButton, !canMarkTaken && styles.verificationCompleteButtonDisabled]}
            onPress={() => {
              void completeIntakeVerification();
            }}
          >
            <Text style={[styles.verificationCompleteButtonText, !canMarkTaken && styles.verificationCompleteButtonTextDisabled]}>
              Mark Taken
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.verificationCancelButton} onPress={resetIntakeVerification}>
            <Text style={styles.verificationCancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.staticHeaderWrap}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>💊 My Medicines</Text>
          <View style={styles.headerRightSpacer} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.dateTimeCard}>
          <View style={styles.dateTimeBlock}>
            <Text style={styles.dateTimeLabel}>📅 Today</Text>
            <Text style={[styles.dateTimeValue, { fontSize: 18 * textScale, lineHeight: 24 * textScale }]}>{currentDateLabel}</Text>
          </View>
          <View style={styles.dateTimeBlock}>
            <Text style={styles.dateTimeLabel}>🕒 Now</Text>
            <Text style={[styles.dateTimeValue, styles.dateTimeValueStrong, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>
              {currentTimeLabel}
            </Text>
          </View>
        </View>

        <View style={styles.scheduleControlPanel}>
          <View style={styles.scheduleControlGroup}>
            <View style={styles.scheduleControlTitleRow}>
              <Text style={styles.scheduleControlIcon}>👁</Text>
              <Text style={[styles.scheduleControlLabel, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>List</Text>
            </View>
            <View style={styles.scheduleToggleRow}>
              <TouchableOpacity
                style={[styles.scheduleToggleButton, showFullDay && styles.scheduleToggleButtonActive]}
                onPress={() => setShowFullDay(true)}
                accessibilityRole="button"
                accessibilityLabel="Show full day medicine list"
              >
                <Text style={[styles.scheduleToggleButtonText, showFullDay && styles.scheduleToggleButtonTextActive, { fontSize: 16 * textScale, lineHeight: 21 * textScale }]}>Show</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scheduleToggleButton, !showFullDay && styles.scheduleToggleButtonActive]}
                onPress={() => setShowFullDay(false)}
                accessibilityRole="button"
                accessibilityLabel="Hide full day medicine list"
              >
                <Text style={[styles.scheduleToggleButtonText, !showFullDay && styles.scheduleToggleButtonTextActive, { fontSize: 16 * textScale, lineHeight: 21 * textScale }]}>Hide</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.nextDoseCard}>
          <View style={styles.nextDoseMetaRow}>
            <View style={styles.nextDoseTitleWrap}>
              <Text style={[styles.nextDoseLabel, { fontSize: 14 * textScale }]}>🔔 Take Next</Text>
              <Text style={[styles.nextDoseTime, { fontSize: 30 * textScale, lineHeight: 36 * textScale }]}>{nextDoseDisplayTime}</Text>
            </View>
            {!!nextDoseEtaLabel && (
              <View style={styles.etaBadge}>
                <Text style={[styles.etaBadgeText, { fontSize: 13 * textScale }]}>{nextDoseEtaLabel}</Text>
              </View>
            )}
          </View>

          {!!visibleNextDoseGroup.length && (
            <View style={styles.nextIntakeSummaryCard}>
              <Text style={[styles.nextIntakeSummaryTitle, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>This intake</Text>
              <View style={styles.nextIntakeSummaryRow}>
                <View style={styles.nextIntakeSummaryPill}>
                  <Text style={[styles.nextIntakeSummaryValue, { fontSize: 16 * textScale }]}>
                    {nextDoseIntakeSummary.medicineCount} {nextDoseIntakeSummary.medicineLabel}
                  </Text>
                </View>
                <View style={[styles.nextIntakeSummaryPill, styles.nextIntakeSummaryPillStrong]}>
                  <Text style={[styles.nextIntakeSummaryValueStrong, { fontSize: 16 * textScale }]}>
                    Need {formatTabletCount(nextDoseIntakeSummary.tabletCount)} {nextDoseIntakeSummary.tabletLabel}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {!!visibleNextDoseGroup.length && (
            <View style={styles.nextDoseGlobalActionRow}>
              <TouchableOpacity
                style={styles.nextDoseGlobalActionButton}
                onPress={speakNextDoseGroup}
                accessibilityLabel="Play next dose list"
              >
                <Text style={styles.nextDoseGlobalActionIcon}>▶</Text>
                <Text style={[styles.nextDoseGlobalActionLabel, { fontSize: 13 * textScale, lineHeight: 17 * textScale }]}>Read</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextDoseGlobalActionButton}
                onPress={stopVoice}
                accessibilityLabel="Stop voice"
              >
                <Text style={styles.nextDoseGlobalActionIcon}>■</Text>
                <Text style={[styles.nextDoseGlobalActionLabel, { fontSize: 13 * textScale, lineHeight: 17 * textScale }]}>Stop</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextDoseGlobalActionButton, isSavingStatus && styles.entryActionButtonDisabled]}
                onPress={openOneTimeIntakeVerification}
                disabled={isSavingStatus}
                accessibilityLabel="Mark all medicines for this time"
              >
                <Text style={styles.nextDoseGlobalActionIcon}>1x</Text>
                <Text style={[styles.nextDoseGlobalActionLabel, { fontSize: 13 * textScale, lineHeight: 17 * textScale }]}>One Time</Text>
              </TouchableOpacity>
            </View>
          )}

          {visibleNextDoseGroup.length ? (
            visibleNextDoseGroup.map((entry) => {
              const isLocked = isEntryInteractionLocked(entry);

              return (
              <View key={`next-${entry.stableId}`} style={[styles.highlightMedicineRow, isLocked && styles.highlightMedicineRowLocked]}>
                <View style={styles.highlightMedicineHeaderRow}>
                  <View style={styles.highlightAppearance}>
                    {renderAppearanceIcon(entry.shape, entry.color, true)}
                  </View>
                  <View style={styles.highlightTextWrap}>
                    <Text style={[styles.highlightMedicineName, isLocked && styles.highlightTextLocked, { fontSize: 25 * textScale, lineHeight: 30 * textScale }]}>{entry.medicineName}</Text>
                    <Text style={[styles.highlightMedicineMeta, isLocked && styles.highlightTextLocked, { fontSize: 18 * textScale, lineHeight: 23 * textScale }]}>{entry.dosageMg}mg</Text>
                    <Text style={[styles.highlightMedicineSubMeta, isLocked && styles.highlightTextLocked, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>
                      {entry.timesPerDay} {entry.timesPerDay === 1 ? 'time' : 'times'} / day
                    </Text>
                  <Text style={[styles.highlightMedicineDoseText, isLocked && styles.highlightTextLocked, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>
                      {getIntakeAmountText(entry)}
                  </Text>
                  </View>
                </View>

                <View style={styles.entryStatusRow}>
                  <TouchableOpacity
                    style={[styles.entryStatusButton, isLocked && styles.entryStatusButtonDisabled]}
                    onPress={() => handleSaveDoseStatus(entry, 'taken')}
                    disabled={isSavingStatus || isLocked}
                  >
                    <Text style={[styles.entryStatusButtonText, isLocked && styles.entryStatusButtonTextDisabled, { fontSize: 16 * textScale, lineHeight: 21 * textScale }]}>✓ Taken</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.entryStatusButton, styles.entryStatusButtonReminder, isLocked && styles.entryStatusButtonDisabled]}
                    onPress={() => openRemindMinutePicker(entry)}
                    disabled={isSavingStatus || isLocked}
                  >
                    <Text style={[styles.entryStatusButtonText, isLocked && styles.entryStatusButtonTextDisabled, { fontSize: 16 * textScale, lineHeight: 21 * textScale }]}>🔔 Remind</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.entryStatusButton, styles.entryStatusButtonDanger, isLocked && styles.entryStatusButtonDisabled]}
                    onPress={() => openOverdoseTabletPicker(entry)}
                    disabled={isSavingStatus || isLocked}
                  >
                    <Text style={[styles.entryStatusButtonText, isLocked && styles.entryStatusButtonTextDisabled, { fontSize: 16 * textScale, lineHeight: 21 * textScale }]}>⚠ Overdose</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.entryActionRow}>
                  <TouchableOpacity
                    style={[styles.entryActionButton, isLocked && styles.entryActionButtonDisabled]}
                    onPress={() => handleEntrySpeak(entry)}
                    disabled={isLocked}
                  >
                    <Text style={[styles.entryActionButtonText, isLocked && styles.entryActionButtonTextDisabled, { fontSize: 15 * textScale }]}>
                      {isVoiceListening && voiceTargetEntryKey === getEntryStatusKey(entry) ? 'Listening...' : '🔊 Speak'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {!!(isVoiceListening && voiceTargetEntryKey === getEntryStatusKey(entry) && voiceTranscript) && (
                  <Text style={[styles.entryVoiceText, { fontSize: 11 * textScale }]}>Heard: {voiceTranscript}</Text>
                )}

                {!!getSavedStatusTextForEntry(entry) && (
                  <Text style={[styles.entrySavedStatusText, { fontSize: 14 * textScale, lineHeight: 19 * textScale }]}>{getSavedStatusTextForEntry(entry)}</Text>
                )}
              </View>
            );})
          ) : (
            <View style={styles.noNextDoseWrap}>
              <Text style={styles.noNextDoseText}>No medicine to take now.</Text>
            </View>
          )}
        </View>

        {!showFullDay && (
          <TouchableOpacity
            style={styles.fullDayPrompt}
            onPress={() => setShowFullDay(true)}
            accessibilityRole="button"
            accessibilityLabel="Show all medicines today"
          >
            <Text style={styles.fullDayPromptIcon}>📋</Text>
            <View style={styles.fullDayPromptTextWrap}>
              <Text style={[styles.fullDayPromptTitle, { fontSize: 18 * textScale, lineHeight: 23 * textScale }]}>See all medicines</Text>
              <Text style={[styles.fullDayPromptText, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>Tap for full day list</Text>
            </View>
          </TouchableOpacity>
        )}

        {showFullDay && (
          <View style={styles.allTodayPanel}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { fontSize: 24 * textScale, lineHeight: 29 * textScale }]}>📋 All Today</Text>
              <View style={styles.totalBadge}>
                <Text style={styles.totalBadgeText}>{upcomingTodaySchedule.length}</Text>
              </View>
            </View>

            {isLoading ? (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color="#2f5d50" />
                <Text style={[styles.loaderText, { fontSize: 14 * textScale }]}>Loading schedule...</Text>
              </View>
            ) : null}

            {!isLoading && !!errorMessage && <Text style={[styles.errorText, { fontSize: 13 * textScale }]}>{errorMessage}</Text>}

            {!isLoading && !errorMessage && upcomingTodaySchedule.length === 0 && (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyTitle, { fontSize: 17 * textScale }]}>No medicines now</Text>
                <Text style={[styles.emptyText, { fontSize: 13 * textScale }]}>You are done for today.</Text>
              </View>
            )}

            {!isLoading && !errorMessage && upcomingTodaySchedule.map((entry) => (
              <TouchableOpacity
                key={entry.stableId}
                style={styles.scheduleItemCard}
                activeOpacity={0.9}
                onPress={() => speakScheduleDetails(entry)}
              >
                <View style={styles.scheduleMainCol}>
                  <Text style={[styles.scheduleMedicineName, { fontSize: 21 * textScale, lineHeight: 26 * textScale }]}>{entry.medicineName}</Text>
                  <Text style={[styles.scheduleMetaText, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>
                    {entry.dosageMg}mg
                  </Text>
                  <Text style={[styles.scheduleSubMetaText, { fontSize: 13 * textScale, lineHeight: 18 * textScale }]}>
                    ⏰ {entry.rowLabel}: {entry.tabletTimeLabel}
                  </Text>
                  <Text style={[styles.scheduleRuleText, { fontSize: 13 * textScale, lineHeight: 18 * textScale }]}>
                    {entry.reminderRuleLabel}
                  </Text>
                  <Text style={[styles.scheduleDoseText, { fontSize: 13 * textScale, lineHeight: 17 * textScale }]}>
                    {getIntakeAmountText(entry)}
                  </Text>
                </View>

                <View style={styles.scheduleAppearanceDot}>
                  {renderAppearanceIcon(entry.shape, entry.color)}
                </View>

                <Text style={styles.scheduleArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

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
    backgroundColor: '#f7efe4',
  },
  verificationContainer: {
    flexGrow: 1,
    backgroundColor: '#f7efe4',
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 28,
  },
  verificationHeroCard: {
    borderRadius: 22,
    backgroundColor: '#2f5d50',
    borderWidth: 2,
    borderColor: '#f4cf75',
    padding: 16,
    marginBottom: 14,
  },
  verificationHeroTitle: {
    color: '#ffffff',
    fontWeight: '900',
  },
  verificationHeroText: {
    color: '#fff8d6',
    fontWeight: '700',
    marginTop: 6,
  },
  verificationMedicineCard: {
    borderRadius: 20,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationAppearanceWrap: {
    marginRight: 12,
  },
  verificationMedicineTextWrap: {
    flex: 1,
  },
  verificationMedicineName: {
    color: '#2d241d',
    fontWeight: '900',
  },
  verificationMedicineMeta: {
    color: '#74665b',
    fontWeight: '800',
    marginTop: 3,
  },
  verificationMedicineList: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#f8f2e9',
    borderWidth: 1,
    borderColor: '#eadcca',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  verificationMedicineListText: {
    color: '#5d5045',
    fontWeight: '800',
  },
  verificationStepCard: {
    borderRadius: 20,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    padding: 14,
    marginBottom: 14,
  },
  verificationStepTitle: {
    color: '#2d241d',
    fontWeight: '900',
    marginBottom: 8,
  },
  verificationStepText: {
    color: '#74665b',
    fontWeight: '700',
    marginBottom: 12,
  },
  verificationAnalysisBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eadcca',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  verificationAnalysisRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationAnalysisText: {
    color: '#5d5045',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginLeft: 6,
  },
  verificationAnalysisMeta: {
    color: '#1e6f5c',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    marginTop: 5,
  },
  verificationPhoto: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    backgroundColor: '#eee7dc',
    marginBottom: 12,
  },
  verificationPhotoPlaceholder: {
    height: 170,
    borderRadius: 16,
    backgroundColor: '#f2e8dc',
    borderWidth: 1,
    borderColor: '#eadcca',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  verificationPhotoPlaceholderText: {
    color: '#74665b',
    fontSize: 14,
    fontWeight: '900',
  },
  verificationCameraButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationCameraButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  verificationCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  verificationCountValue: {
    minWidth: 92,
    height: 58,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  verificationCountValueGood: {
    backgroundColor: '#e9f7f1',
    borderColor: '#a8dbc8',
  },
  verificationCountValueBad: {
    backgroundColor: '#fff0f2',
    borderColor: '#edbdc4',
  },
  verificationCountValueText: {
    color: '#2d241d',
    fontWeight: '900',
  },
  verificationReadOnlyCountText: {
    marginTop: 8,
    color: '#74665b',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  verificationCountStatus: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    marginTop: 10,
  },
  verificationCountStatusGood: {
    color: '#1e6f5c',
  },
  verificationCountStatusBad: {
    color: '#9b3d47',
  },
  verificationCheckRow: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  verificationCheckRowActive: {
    borderColor: '#a8dbc8',
    backgroundColor: '#e9f7f1',
  },
  verificationCheckIcon: {
    width: 32,
    color: '#1e6f5c',
    fontSize: 22,
    fontWeight: '900',
  },
  verificationCheckText: {
    flex: 1,
    color: '#2d241d',
    fontWeight: '900',
  },
  verificationCompleteButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#1e6f5c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  verificationCompleteButtonDisabled: {
    backgroundColor: '#c8d1cb',
  },
  verificationCompleteButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  verificationCompleteButtonTextDisabled: {
    color: '#6f7b75',
  },
  verificationCancelButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verificationCancelButtonText: {
    color: '#74665b',
    fontSize: 16,
    fontWeight: '900',
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#f7efe4',
    paddingHorizontal: 14,
    paddingTop: 0,
    paddingBottom: 28,
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
  backIcon: {
    fontSize: 32,
    lineHeight: 36,
    color: '#2f5d50',
    marginTop: -3,
    fontWeight: '900',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    color: '#ffffff',
    fontWeight: '900',
    paddingHorizontal: 8,
  },
  headerRightSpacer: {
    width: 46,
    height: 46,
  },
  dateTimeCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: 'row',
    columnGap: 10,
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  dateTimeBlock: {
    flex: 1,
  },
  dateTimeLabel: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0,
    color: '#74665b',
    fontWeight: '900',
  },
  dateTimeValue: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    color: '#2d241d',
  },
  dateTimeValueStrong: {
    color: '#2f5d50',
  },
  scheduleControlPanel: {
    borderRadius: 20,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#eadcca',
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    columnGap: 10,
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  scheduleControlGroup: {
    flex: 1,
  },
  scheduleControlTitleRow: {
    minHeight: 28,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleControlIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f7efe4',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 15,
    marginRight: 7,
  },
  scheduleControlLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: '#5d5045',
    fontWeight: '900',
  },
  scheduleToggleRow: {
    flexDirection: 'row',
    columnGap: 8,
  },
  scheduleToggleButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#f8f2e9',
    borderWidth: 1,
    borderColor: '#eadcca',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  scheduleToggleButtonActive: {
    backgroundColor: '#e9f7f1',
    borderColor: '#a8dbc8',
  },
  scheduleToggleButtonText: {
    fontSize: 16,
    lineHeight: 21,
    color: '#5d5045',
    fontWeight: '900',
    textAlign: 'center',
  },
  scheduleToggleButtonTextActive: {
    color: '#2f5d50',
  },
  nextDoseCard: {
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#f4cf75',
    backgroundColor: '#2f5d50',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#315a4f',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 6,
  },
  nextDoseMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nextDoseTitleWrap: {
    flex: 1,
    paddingRight: 10,
  },
  nextDoseLabel: {
    fontSize: 14,
    textTransform: 'uppercase',
    fontWeight: '900',
    color: '#f8d978',
    letterSpacing: 0,
  },
  nextDoseTime: {
    marginTop: 5,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#ffffff',
  },
  etaBadge: {
    borderRadius: 16,
    backgroundColor: '#f8d978',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  etaBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#342719',
  },
  nextIntakeSummaryCard: {
    borderRadius: 18,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#f4cf75',
    padding: 12,
    marginBottom: 12,
  },
  nextIntakeSummaryTitle: {
    color: '#5d5045',
    fontWeight: '900',
    marginBottom: 8,
  },
  nextIntakeSummaryRow: {
    flexDirection: 'row',
    columnGap: 8,
  },
  nextIntakeSummaryPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#eaf4ff',
    borderWidth: 1,
    borderColor: '#b9d4f2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  nextIntakeSummaryPillStrong: {
    backgroundColor: '#f8d978',
    borderColor: '#f4cf75',
  },
  nextIntakeSummaryValue: {
    color: '#2f5d50',
    fontWeight: '900',
    textAlign: 'center',
  },
  nextIntakeSummaryValueStrong: {
    color: '#342719',
    fontWeight: '900',
    textAlign: 'center',
  },
  highlightMedicineRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    backgroundColor: '#fffdf8',
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fff4c6',
    shadowColor: '#17382f',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  highlightMedicineRowLocked: {
    backgroundColor: '#eef2f5',
    borderWidth: 1,
    borderColor: '#d9e0e6',
  },
  highlightAppearance: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
  },
  appearanceIconFrame: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#f7efe4',
    borderWidth: 1,
    borderColor: '#d8c9b7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceIconFrameLarge: {
    width: 46,
    height: 46,
    borderRadius: 16,
  },
  pillShape: {
    width: 28,
    height: 20,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(36,53,47,0.22)',
  },
  pillShapeLarge: {
    width: 36,
    height: 26,
  },
  pillShapeRound: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  pillShapeOval: {
    width: 34,
    height: 24,
    borderRadius: 16,
  },
  pillShapeCapsule: {
    width: 36,
    height: 20,
    borderRadius: 14,
  },
  pillShapeSquare: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  pillShapeDiamond: {
    width: 27,
    height: 27,
    borderRadius: 6,
    transform: [{ rotate: '45deg' }],
  },
  pillShapeTriangle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    textShadowColor: 'rgba(36,53,47,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  pillShapeTriangleLarge: {
    fontSize: 36,
    lineHeight: 40,
  },
  highlightTextWrap: {
    flex: 1,
  },
  highlightMedicineHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  highlightMedicineName: {
    fontSize: 25,
    fontWeight: '900',
    color: '#24352f',
    lineHeight: 30,
  },
  highlightMedicineMeta: {
    marginTop: 3,
    fontSize: 18,
    lineHeight: 23,
    color: '#5d5045',
    fontWeight: '800',
  },
  highlightMedicineSubMeta: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 20,
    color: '#6d6258',
    fontWeight: '700',
  },
  highlightMedicineDoseText: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 20,
    color: '#2f5d50',
    fontWeight: '900',
  },
  highlightTextLocked: {
    color: '#7d8b96',
  },
  entryStatusRow: {
    width: '100%',
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: '#f8fbff',
    borderWidth: 2,
    borderColor: '#cfe2f5',
    padding: 8,
  },
  entryStatusButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: '#1e6f5c',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  entryStatusButtonDanger: {
    backgroundColor: '#9b3d47',
  },
  entryStatusButtonReminder: {
    backgroundColor: '#8a641c',
  },
  entryStatusButtonDisabled: {
    backgroundColor: '#b6c0c8',
  },
  entryStatusButtonText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  entryStatusButtonTextDisabled: {
    color: '#eef2f5',
  },
  entryActionRow: {
    width: '100%',
    flexDirection: 'row',
    marginTop: 2,
  },
  entryActionButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#a8dbc8',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryActionButtonDisabled: {
    backgroundColor: '#edf1f4',
    borderColor: '#d4dce3',
  },
  entryActionButtonText: {
    color: '#2f5d50',
    fontSize: 17,
    fontWeight: '900',
  },
  entryActionButtonTextDisabled: {
    color: '#7e8b95',
  },
  entrySavedStatusText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 19,
    color: '#2f5d50',
    fontWeight: '800',
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
    marginBottom: 10,
  },
  nextDoseGlobalActionButton: {
    flex: 1,
    minHeight: 64,
    borderRadius: 16,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#f4cf75',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  nextDoseGlobalActionIcon: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    color: '#2f5d50',
    textAlign: 'center',
  },
  nextDoseGlobalActionLabel: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#5d5045',
    textAlign: 'center',
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
    fontSize: 16,
    lineHeight: 22,
    color: '#5d5045',
    fontWeight: '700',
  },
  fullDayPrompt: {
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#eadcca',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullDayPromptIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#f8d978',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 24,
    marginRight: 12,
  },
  fullDayPromptTextWrap: {
    flex: 1,
  },
  fullDayPromptTitle: {
    fontSize: 18,
    lineHeight: 23,
    color: '#2d241d',
    fontWeight: '900',
  },
  fullDayPromptText: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 20,
    color: '#74665b',
    fontWeight: '700',
  },
  allTodayPanel: {
    borderRadius: 24,
    backgroundColor: '#eaf4ff',
    borderWidth: 2,
    borderColor: '#b9d4f2',
    padding: 12,
    marginTop: 4,
    marginBottom: 12,
    shadowColor: '#2f65a3',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#2d241d',
    lineHeight: 29,
  },
  totalBadge: {
    minWidth: 40,
    borderRadius: 14,
    backgroundColor: '#2f5d50',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  totalBadgeText: {
    fontSize: 13,
    textTransform: 'uppercase',
    color: '#ffffff',
    fontWeight: '900',
    textAlign: 'center',
  },
  scheduleItemCard: {
    minHeight: 104,
    borderRadius: 18,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#eadcca',
    borderLeftWidth: 5,
    borderLeftColor: '#2f5d50',
    paddingVertical: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  scheduleMainCol: {
    flex: 1,
  },
  scheduleMedicineName: {
    fontSize: 21,
    fontWeight: '900',
    color: '#24352f',
    lineHeight: 26,
  },
  scheduleMetaText: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 20,
    color: '#5d5045',
    fontWeight: '800',
  },
  scheduleSubMetaText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: '#74665b',
    fontWeight: '700',
  },
  scheduleRuleText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: '#2f65a3',
    fontWeight: '800',
  },
  scheduleDoseText: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: '#e9f7f1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 13,
    lineHeight: 17,
    color: '#2f5d50',
    fontWeight: '900',
  },
  scheduleAppearanceDot: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
  },
  scheduleArrow: {
    marginLeft: 9,
    fontSize: 22,
    color: '#b3bdc8',
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
