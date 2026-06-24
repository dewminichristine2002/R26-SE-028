import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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

const colorMap = {
  red: '#e74c3c',
  blue: '#3498db',
  green: '#2ecc71',
  yellow: '#f1c40f',
  orange: '#e67e22',
  purple: '#9b59b6',
  pink: '#ff6ea8',
  white: '#ecf0f1',
  black: '#2d3436',
  brown: '#8e6e53',
  gray: '#95a5a6',
  grey: '#95a5a6',
};

const getColorValue = (color) => {
  const normalized = String(color || '').trim().toLowerCase();
  if (!normalized) {
    return '#d9e8f7';
  }

  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    return normalized;
  }

  return colorMap[normalized] || '#d9e8f7';
};

const formatPercent = (value) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return '0%';
  }
  return `${Math.round(Math.min(1, normalized) * 100)}%`;
};

const getDisplayName = (match) => {
  if (!match?.medicineName) {
    return 'Unknown tablet';
  }

  const dosage = Number(match?.dosageMg);
  if (Number.isFinite(dosage) && dosage > 0) {
    return `${match.medicineName} ${dosage}mg`;
  }

  return match.medicineName;
};

const normalizeSlotToken = (token = '') => String(token || '').toUpperCase().replace(/[_-]/g, ' ').trim();

const parseTakeWith = (takeWithValue = '') =>
  String(takeWithValue || '')
    .split(',')
    .map((part) => normalizeSlotToken(part))
    .filter(Boolean);

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

const normalizeMedicineName = (value = '') => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const resolveMatchedMedication = (match, medications = []) => {
  if (!match) {
    return null;
  }

  const matchId = String(match.id || '').trim();
  if (matchId) {
    const byId = medications.find((item) => String(item?.id || '').trim() === matchId);
    if (byId) {
      return byId;
    }
  }

  const matchName = normalizeMedicineName(match.medicineName);
  const matchDosage = Number(match.dosageMg);

  return medications.find((item) => {
    const itemName = normalizeMedicineName(item?.medicine_name || item?.medicineName);
    const itemDosage = Number(item?.dosage_mg ?? item?.dosageMg);
    const dosageMatches = !Number.isFinite(matchDosage) || !Number.isFinite(itemDosage) || Math.abs(matchDosage - itemDosage) < 0.001;
    return itemName && itemName === matchName && dosageMatches;
  }) || null;
};

const getMedicationScheduleEntries = (medication, routine, referenceDate = new Date()) => {
  if (!medication || !routine) {
    return [];
  }

  const validKeys = parseTakeWith(medication.take_with || medication.takeWith)
    .map((slot) => SLOT_TO_KEY[slot])
    .filter(Boolean)
    .sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

  return validKeys.map((key) => {
    const baseDate = parseRoutineTimeToDate(routine[key], referenceDate);
    const takeDate = applyMinutesOffset(baseDate, getReminderOffsetMinutes(medication.intake_timing || medication.intakeTiming)) || baseDate;
    return {
      key,
      label: SLOT_LABELS[key] || key,
      routineTimeLabel: formatDateTo12Hour(baseDate),
      takeTimeLabel: formatDateTo12Hour(takeDate),
      ruleLabel: getTakeTimeRuleLabel(medication.intake_timing || medication.intakeTiming),
    };
  });
};

const TabletIdentifierScreen = ({ onBack, reminderTextScale = 1 }) => {
  const [photoUri, setPhotoUri] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [routine, setRoutine] = useState(null);
  const [medications, setMedications] = useState([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState('');
  const textScale = reminderTextScale || 1;

  const bestMatch = analysis?.match || null;
  const matches = Array.isArray(analysis?.matches) ? analysis.matches : [];
  const closeMatches = bestMatch ? matches.slice(1, 4) : matches.slice(0, 4);
  const isMatched = analysis?.status === 'matched' && bestMatch;
  const matchedMedication = useMemo(() => resolveMatchedMedication(bestMatch, medications), [bestMatch, medications]);
  const scheduleEntries = useMemo(
    () => getMedicationScheduleEntries(matchedMedication, routine),
    [matchedMedication, routine]
  );
  const scheduledTabletCount = Math.max(
    0.5,
    Number(matchedMedication?.daily_amount ?? matchedMedication?.dailyAmount ?? bestMatch?.dailyAmount) || 1
  );
  const scheduledTabletUnit = scheduledTabletCount === 1 ? 'tablet' : 'tablets';
  const shouldShowScheduleCard = Boolean(bestMatch) && analysis?.status !== 'dataset-match';

  useEffect(() => {
    let isActive = true;

    const loadScheduleContext = async () => {
      try {
        setIsScheduleLoading(true);
        setScheduleError('');
        const [routineData, medicationData] = await Promise.all([
          routineService.getRoutine(),
          medicationService.getMyMedications(),
        ]);

        if (!isActive) {
          return;
        }

        setRoutine(routineData?.mealTimes || null);
        setMedications(medicationData || []);
      } catch (error) {
        if (isActive) {
          setScheduleError(error?.message || 'Could not load schedule details.');
        }
      } finally {
        if (isActive) {
          setIsScheduleLoading(false);
        }
      }
    };

    loadScheduleContext();

    return () => {
      isActive = false;
    };
  }, []);

  const analyzePhoto = async (imageBase64) => {
    if (!imageBase64) {
      return;
    }

    try {
      setIsAnalyzing(true);
      setMessage('Checking tablet appearance...');
      const result = await medicationService.identifyTabletByPhoto(imageBase64);
      setAnalysis(result);

      if ((result?.status === 'matched' || result?.status === 'dataset-match') && result?.match) {
        const sourceText = result?.identitySource === 'visual-retrieval'
          ? 'visual search'
          : result?.identitySource === 'trained-model'
          ? 'trained model'
          : 'appearance matching';
        if (result?.status === 'dataset-match') {
          setMessage(`Closest dataset match found with ${formatPercent(result.confidence)} confidence using ${sourceText}. Save or map this label if you want it matched to your medicine list.`);
          return;
        }
        setMessage(`Best match found with ${formatPercent(result.confidence)} confidence using ${sourceText}.`);
      } else if (result?.status === 'ambiguous') {
        setMessage(result?.ambiguityReason || result?.error || 'Several saved medicines look similar. Please compare the close matches.');
      } else {
        setMessage(result?.error || 'Could not identify with confidence. Try a clearer photo.');
      }
    } catch (error) {
      setAnalysis(null);
      setMessage(error?.response?.data?.error || error?.message || 'Could not analyze the tablet photo.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera Needed', 'Camera permission is required to identify a tablet.');
        return;
      }

      const pickerResult = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
      });

      if (pickerResult.canceled || !pickerResult.assets?.length) {
        return;
      }

      const asset = pickerResult.assets[0];
      setPhotoUri(asset?.uri || '');
      setAnalysis(null);
      setMessage('');
      await analyzePhoto(asset?.base64 || '');
    } catch (error) {
      Alert.alert('Camera Error', error?.message || 'Could not open camera.');
    }
  };

  const renderAppearanceIcon = (shape, color) => {
    const normalizedShape = String(shape || '').trim().toLowerCase();
    const resolvedColor = getColorValue(color);
    const shapeStyle = [
      styles.pillShape,
      ['round', 'circle'].includes(normalizedShape) && styles.pillShapeRound,
      normalizedShape === 'oval' && styles.pillShapeOval,
      ['capsule', 'oblong'].includes(normalizedShape) && styles.pillShapeCapsule,
      ['tablet', 'square'].includes(normalizedShape) && styles.pillShapeSquare,
      normalizedShape === 'diamond' && styles.pillShapeDiamond,
      { backgroundColor: resolvedColor },
    ];

    return (
      <View style={styles.appearanceIconFrame}>
        {normalizedShape === 'triangle' ? (
          <Text style={[styles.pillShapeTriangle, { color: resolvedColor }]}>^</Text>
        ) : (
          <View style={shapeStyle} />
        )}
      </View>
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.staticHeaderWrap}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back to reminder menu"
          >
            <Text style={styles.backIcon}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>Tablet Identifier</Text>
          <View style={styles.headerRightSpacer} />
        </View>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <View style={styles.introIconWrap}>
            <Text style={styles.introIcon}>ID</Text>
          </View>
          <View style={styles.introTextWrap}>
            <Text style={[styles.introTitle, { fontSize: 24 * textScale, lineHeight: 30 * textScale }]}>Take one clear tablet photo</Text>
            <Text style={[styles.introText, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>
              Place one tablet on a plain surface. The app matches it with medicines saved in your list.
            </Text>
          </View>
        </View>

        <View style={styles.photoPanel}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={[styles.photoPlaceholderText, { fontSize: 15 * textScale }]}>No photo yet</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.cameraButton, isAnalyzing && styles.cameraButtonDisabled]}
            onPress={handleTakePhoto}
            disabled={isAnalyzing}
            accessibilityRole="button"
            accessibilityLabel={photoUri ? 'Retake tablet photo' : 'Take tablet photo'}
          >
            <Text style={[styles.cameraButtonText, { fontSize: 17 * textScale }]}>
              {photoUri ? 'Retake Photo' : 'Open Camera'}
            </Text>
          </TouchableOpacity>
        </View>

        {!!message && (
          <View style={[styles.messageCard, isMatched ? styles.messageCardGood : styles.messageCardWarn]}>
            {isAnalyzing ? <ActivityIndicator size="small" color="#2f5d50" /> : null}
            <Text style={[styles.messageText, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>{message}</Text>
          </View>
        )}

        {bestMatch ? (
          <View style={styles.resultCard}>
            <Text style={[styles.resultLabel, { fontSize: 13 * textScale }]}>
              {analysis?.status === 'dataset-match' ? 'Closest dataset match' : analysis?.status === 'ambiguous' ? 'Closest appearance match' : 'Likely medicine'}
            </Text>
            <View style={styles.resultMainRow}>
              {renderAppearanceIcon(bestMatch.shape || analysis?.detectedShape, bestMatch.color || analysis?.detectedColor)}
              <View style={styles.resultTextWrap}>
                <Text style={[styles.resultName, { fontSize: 26 * textScale, lineHeight: 32 * textScale }]}>{getDisplayName(bestMatch)}</Text>
                <Text style={[styles.resultMeta, { fontSize: 14 * textScale, lineHeight: 20 * textScale }]}>
                  Confidence {formatPercent(bestMatch.confidence)} - {analysis?.identitySource === 'visual-retrieval' ? 'Visual search' : analysis?.identitySource === 'trained-model' ? 'Trained model' : `Detected ${analysis?.detectedColor || 'color'} ${analysis?.detectedShape || 'shape'}`}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {shouldShowScheduleCard ? (
          <View style={styles.scheduleCard}>
            <Text style={[styles.scheduleTitle, { fontSize: 18 * textScale, lineHeight: 24 * textScale }]}>When to take</Text>
            {isScheduleLoading ? (
              <Text style={[styles.scheduleHint, { fontSize: 14 * textScale, lineHeight: 20 * textScale }]}>Loading saved schedule...</Text>
            ) : scheduleEntries.length > 0 ? (
              <>
                <Text style={[styles.scheduleDoseText, { fontSize: 14 * textScale, lineHeight: 20 * textScale }]}>
                  Take {formatTabletCount(scheduledTabletCount)} {scheduledTabletUnit} each scheduled time.
                </Text>
                {scheduleEntries.map((entry) => (
                  <View key={entry.key} style={styles.scheduleRow}>
                    <View style={styles.scheduleTimeBadge}>
                      <Text style={[styles.scheduleTimeText, { fontSize: 15 * textScale }]}>{entry.takeTimeLabel}</Text>
                    </View>
                    <View style={styles.scheduleRowTextWrap}>
                      <Text style={[styles.scheduleSlotText, { fontSize: 16 * textScale, lineHeight: 22 * textScale }]}>{entry.label}</Text>
                      <Text style={[styles.scheduleRuleText, { fontSize: 13 * textScale, lineHeight: 18 * textScale }]}>
                        {entry.ruleLabel} from routine time {entry.routineTimeLabel}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <Text style={[styles.scheduleHint, { fontSize: 14 * textScale, lineHeight: 20 * textScale }]}>
                {scheduleError ? 'Schedule details could not be loaded right now.' : 'No saved intake time found for this tablet.'}
              </Text>
            )}
          </View>
        ) : null}

        {analysis?.detectedColor || analysis?.detectedShape ? (
          <View style={styles.detectedCard}>
            <Text style={[styles.detectedTitle, { fontSize: 17 * textScale }]}>Detected appearance</Text>
            <Text style={[styles.detectedText, { fontSize: 14 * textScale }]}>
              Color: {analysis?.detectedColor || 'unknown'} - Shape: {analysis?.detectedShape || 'unknown'}
            </Text>
            {analysis?.visualFeatures?.hasVisibleDetail ? (
              <Text style={[styles.detectedHint, { fontSize: 13 * textScale }]}>Surface details were visible for model-based matching.</Text>
            ) : (
              <Text style={[styles.detectedHint, { fontSize: 13 * textScale }]}>For similar tablets, capture imprint or markings clearly.</Text>
            )}
          </View>
        ) : null}

        {closeMatches.length > 0 ? (
          <View style={styles.alternativesCard}>
            <Text style={[styles.alternativesTitle, { fontSize: 18 * textScale }]}>Close matches</Text>
            {closeMatches.map((item) => (
              <View key={`${item.id}-${item.medicineName}`} style={styles.alternativeRow}>
                {renderAppearanceIcon(item.shape, item.color)}
                <View style={styles.alternativeTextWrap}>
                  <Text style={[styles.alternativeName, { fontSize: 16 * textScale }]}>{getDisplayName(item)}</Text>
                  <Text style={[styles.alternativeMeta, { fontSize: 13 * textScale }]}>{formatPercent(item.confidence)} match</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f7efe4',
  },
  staticHeaderWrap: {
    backgroundColor: '#f7efe4',
    paddingHorizontal: 14,
    paddingTop: 26,
  },
  headerRow: {
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: '#2f5d50',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#f4cf75',
    marginBottom: 14,
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
    color: '#ffffff',
    fontWeight: '900',
    paddingHorizontal: 8,
  },
  headerRightSpacer: {
    width: 46,
    height: 46,
  },
  scrollArea: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 14,
    paddingBottom: 28,
  },
  introCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#eadcca',
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  introIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: '#f8d978',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  introIcon: {
    color: '#2f5d50',
    fontSize: 18,
    fontWeight: '900',
  },
  introTextWrap: {
    flex: 1,
  },
  introTitle: {
    color: '#2d241d',
    fontWeight: '900',
  },
  introText: {
    marginTop: 4,
    color: '#74665b',
    fontWeight: '700',
  },
  photoPanel: {
    borderRadius: 24,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    padding: 14,
    marginBottom: 14,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 1.25,
    borderRadius: 18,
    backgroundColor: '#f2e7d8',
    marginBottom: 12,
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 1.25,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#d8c9b7',
    backgroundColor: '#f8f2e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  photoPlaceholderText: {
    color: '#74665b',
    fontWeight: '900',
  },
  cameraButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButtonDisabled: {
    backgroundColor: '#9bad9f',
  },
  cameraButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  messageCard: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  messageCardGood: {
    backgroundColor: '#e9f7f1',
    borderColor: '#a8dbc8',
  },
  messageCardWarn: {
    backgroundColor: '#fff4e8',
    borderColor: '#f0cda8',
  },
  messageText: {
    flex: 1,
    color: '#2d241d',
    fontWeight: '800',
  },
  resultCard: {
    borderRadius: 24,
    backgroundColor: '#e9f7f1',
    borderWidth: 2,
    borderColor: '#a8dbc8',
    padding: 16,
    marginBottom: 14,
  },
  resultLabel: {
    color: '#2f5d50',
    textTransform: 'uppercase',
    fontWeight: '900',
    marginBottom: 10,
  },
  resultMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultTextWrap: {
    flex: 1,
    marginLeft: 12,
  },
  resultName: {
    color: '#24352f',
    fontWeight: '900',
  },
  resultMeta: {
    marginTop: 5,
    color: '#4d645b',
    fontWeight: '800',
  },
  scheduleCard: {
    borderRadius: 22,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    padding: 14,
    marginBottom: 14,
  },
  scheduleTitle: {
    color: '#2d241d',
    fontWeight: '900',
    marginBottom: 8,
  },
  scheduleDoseText: {
    color: '#4d4038',
    fontWeight: '800',
    marginBottom: 10,
  },
  scheduleRow: {
    minHeight: 64,
    borderTopWidth: 1,
    borderTopColor: '#efe3d6',
    paddingTop: 10,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleTimeBadge: {
    minWidth: 86,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginRight: 10,
  },
  scheduleTimeText: {
    color: '#ffffff',
    fontWeight: '900',
    textAlign: 'center',
  },
  scheduleRowTextWrap: {
    flex: 1,
  },
  scheduleSlotText: {
    color: '#24352f',
    fontWeight: '900',
  },
  scheduleRuleText: {
    marginTop: 3,
    color: '#74665b',
    fontWeight: '800',
  },
  scheduleHint: {
    color: '#74665b',
    fontWeight: '800',
  },
  alternativesCard: {
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#d5eafa',
    padding: 14,
  },
  detectedCard: {
    borderRadius: 20,
    backgroundColor: '#eef8ff',
    borderWidth: 2,
    borderColor: '#c9e5f5',
    padding: 14,
    marginBottom: 14,
  },
  detectedTitle: {
    color: '#12354d',
    fontWeight: '900',
    marginBottom: 6,
  },
  detectedText: {
    color: '#24352f',
    fontWeight: '900',
  },
  detectedHint: {
    marginTop: 6,
    color: '#607788',
    fontWeight: '800',
  },
  alternativesTitle: {
    color: '#12354d',
    fontWeight: '900',
    marginBottom: 10,
  },
  alternativeRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#edf5fc',
    paddingVertical: 8,
  },
  alternativeTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  alternativeName: {
    color: '#24352f',
    fontWeight: '900',
  },
  alternativeMeta: {
    marginTop: 3,
    color: '#607788',
    fontWeight: '800',
  },
  appearanceIconFrame: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillShape: {
    width: 30,
    height: 22,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(36,53,47,0.22)',
  },
  pillShapeRound: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  pillShapeOval: {
    width: 36,
    height: 25,
    borderRadius: 16,
  },
  pillShapeCapsule: {
    width: 38,
    height: 22,
    borderRadius: 14,
  },
  pillShapeSquare: {
    width: 29,
    height: 29,
    borderRadius: 8,
  },
  pillShapeDiamond: {
    width: 28,
    height: 28,
    borderRadius: 6,
    transform: [{ rotate: '45deg' }],
  },
  pillShapeTriangle: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '900',
    textShadowColor: 'rgba(36,53,47,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});

export default TabletIdentifierScreen;
