import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { routineService } from '../services/routineService';
import { reminderNotificationService } from '../services/reminderNotificationService';

let ExpoSpeechRecognitionModule = null;
let ExpoEventEmitter = null;

try {
  const speech = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speech.ExpoSpeechRecognitionModule;
} catch (error) {
  console.log('[Voice] expo-speech-recognition not available in this build');
}

try {
  const expoModulesCore = require('expo-modules-core');
  ExpoEventEmitter = expoModulesCore.EventEmitter;
} catch (error) {
  console.log('[Voice] expo-modules-core EventEmitter not available in this build');
}

const routineRows = [
  {
    key: 'breakfast',
    label: 'Breakfast',
    subtitle: 'Morning meal',
    icon: '☀️',
    backgroundColor: '#fff4e8',
    borderColor: '#f0cda8',
    accentColor: '#8a4a17',
  },
  {
    key: 'lunch',
    label: 'Lunch',
    subtitle: 'Afternoon meal',
    icon: '🌤️',
    backgroundColor: '#edf5ff',
    borderColor: '#b9d4f2',
    accentColor: '#2f65a3',
  },
  {
    key: 'dinner',
    label: 'Dinner',
    subtitle: 'Evening meal',
    icon: '🌆',
    backgroundColor: '#e9f7f1',
    borderColor: '#a8dbc8',
    accentColor: '#1e6f5c',
  },
  {
    key: 'sleep',
    label: 'Sleep',
    subtitle: 'Bed time',
    icon: '🌙',
    backgroundColor: '#f3efff',
    borderColor: '#cbc0f0',
    accentColor: '#5b4aa0',
  },
];

const RoutineSetupScreen = ({ onBackToMenu, reminderTextScale = 1 }) => {
  const [mealTimes, setMealTimes] = useState({
    breakfast: '08:00 AM',
    lunch: '01:00 PM',
    dinner: '07:00 PM',
    sleep: '10:30 PM',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedMealKey, setSelectedMealKey] = useState(null);
  const [pickerHours, setPickerHours] = useState('08');
  const [pickerMinutes, setPickerMinutes] = useState('00');
  const [pickerPeriod, setPickerPeriod] = useState('AM');
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const textScale = reminderTextScale || 1;

  const parseVoiceCommand = (transcript) => {
    if (!transcript || typeof transcript !== 'string') {
      return null;
    }

    const text = transcript.toLowerCase();

    let mealKey = null;
    if (text.includes('breakfast') || text.includes('morning')) {
      mealKey = 'breakfast';
    } else if (text.includes('lunch') || text.includes('noon')) {
      mealKey = 'lunch';
    } else if (text.includes('dinner') || text.includes('evening')) {
      mealKey = 'dinner';
    } else if (text.includes('sleep') || text.includes('bed')) {
      mealKey = 'sleep';
    }

    const timeMatch = text.match(/(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?\s*(am|pm)?/i);
    if (!timeMatch || !mealKey) {
      return null;
    }

    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    let period = timeMatch[3] ? timeMatch[3].toUpperCase() : null;

    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    if (!period) {
      if (hour === 0) {
        hour = 12;
        period = 'AM';
      } else if (hour > 12) {
        hour -= 12;
        period = 'PM';
      } else {
        period = mealKey === 'breakfast' ? 'AM' : 'PM';
      }
    } else if (hour === 0) {
      hour = 12;
    } else if (hour > 12) {
      hour -= 12;
    }

    return {
      mealKey,
      normalizedTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`,
    };
  };

  const applyVoiceCommand = (transcript) => {
    const parsed = parseVoiceCommand(transcript);

    if (!parsed) {
      Alert.alert(
        'Voice Not Recognized',
        'Try saying: Breakfast 8 AM, Lunch 1:30 PM, Dinner 7 PM, or Sleep 10:30 PM.'
      );
      return;
    }

    setMealTimes((prev) => ({
      ...prev,
      [parsed.mealKey]: parsed.normalizedTime,
    }));

    Alert.alert('Voice Time Set', `${parsed.mealKey.toUpperCase()} set to ${parsed.normalizedTime}`);
  };

  const handleVoiceSetup = async () => {
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert(
        'Voice Unavailable',
        'This app build does not include speech module yet. Rebuild dev client to enable voice setup.'
      );
      return;
    }

    try {
      if (Platform.OS === 'web' && !ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        Alert.alert('Voice Not Available', 'Speech recognition is not available in this browser.');
        return;
      }

      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        return;
      }

      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission Needed', 'Microphone permission is required to use voice setup.');
        return;
      }

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
      setIsListening(true);
    });

    const onEnd = speechEventEmitter.addListener('end', () => {
      setIsListening(false);
    });

    const onError = speechEventEmitter.addListener('error', (event) => {
      setIsListening(false);
      Alert.alert('Voice Error', event?.message || 'Voice recognition failed.');
    });

    const onResult = speechEventEmitter.addListener('result', (event) => {
      const latest = event?.results?.[0]?.transcript || '';
      if (latest) {
        setVoiceTranscript(latest);
      }

      if (event?.isFinal && latest) {
        applyVoiceCommand(latest);
        setVoiceTranscript('');
      }
    });

    return () => {
      onStart?.remove?.();
      onEnd?.remove?.();
      onError?.remove?.();
      onResult?.remove?.();

      try {
        ExpoSpeechRecognitionModule?.abort();
      } catch (error) {
        console.log('[Voice] cleanup skipped:', error?.message || error);
      }
    };
  }, []);

  useEffect(() => {
    const loadRoutine = async () => {
      try {
        const routine = await routineService.getRoutine();
        if (routine?.mealTimes) {
          setMealTimes(routine.mealTimes);
        }
      } catch (error) {
        console.error('[RoutineSetupScreen] Load error:', error.message);
        Alert.alert(
          'Connection Error',
          `Cannot connect to backend: ${error.message}. Using default times. Make sure backend is running and check API_BASE_URL.`
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadRoutine();
  }, []);

  const cards = useMemo(
    () => routineRows.map((row) => ({ ...row, time: mealTimes[row.key] })),
    [mealTimes]
  );
  const selectedMeal = useMemo(
    () => routineRows.find((row) => row.key === selectedMealKey),
    [selectedMealKey]
  );

  const parseTime = (timeStr) => {
    const [time, period] = timeStr.split(' ');
    const [hours, minutes] = time.split(':');
    return { hours: hours.padStart(2, '0'), minutes: minutes.padStart(2, '0'), period };
  };

  const openTimePicker = (key) => {
    const current = mealTimes[key];
    const { hours, minutes, period } = parseTime(current);
    setSelectedMealKey(key);
    setPickerHours(hours);
    setPickerMinutes(minutes);
    setPickerPeriod(period);
    setShowTimePicker(true);
  };

  const saveTimeFromPicker = () => {
    const newTime = `${String(pickerHours).padStart(2, '0')}:${String(pickerMinutes).padStart(2, '0')} ${pickerPeriod}`;
    console.log(`[Time Picker] Saving ${selectedMealKey}: ${newTime}`);
    setMealTimes((prev) => {
      const updated = {
        ...prev,
        [selectedMealKey]: newTime,
      };
      console.log('[Time Picker] Updated mealTimes:', updated);
      return updated;
    });
    setShowTimePicker(false);
  };

  const adjustPickerHours = (delta) => {
    let h = parseInt(pickerHours, 10) + delta;
    if (h < 1) h = 12;
    if (h > 12) h = 1;
    const padded = String(h).padStart(2, '0');
    console.log(`[Picker] Hours: ${pickerHours} + ${delta} = ${padded}`);
    setPickerHours(padded);
  };

  const adjustPickerMinutes = (delta) => {
    let m = parseInt(pickerMinutes, 10) + delta;
    if (m < 0) m = 59;
    if (m > 59) m = 0;
    const padded = String(m).padStart(2, '0');
    console.log(`[Picker] Minutes: ${pickerMinutes} + ${delta} = ${padded}`);
    setPickerMinutes(padded);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      console.log('[Routine Save] Sending to backend:', mealTimes);
      const response = await routineService.saveRoutine(mealTimes);
      console.log('[Routine Save] Response:', response);

      try {
        await reminderNotificationService.rescheduleDailyReminders();
      } catch (notificationError) {
        console.log('[RoutineSetup] Reminder reschedule failed:', notificationError?.message || notificationError);
      }

      Alert.alert('Saved', 'Your routine has been saved successfully.');
    } catch (error) {
      console.error('[Routine Save] Error:', error);
      Alert.alert('Save failed', `Error: ${error.message || 'Could not reach backend. Please check server and try again.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2f5d50" />
        <Text style={[styles.loaderText, { fontSize: 15 * textScale }]}>Loading your routine...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBackToMenu} style={styles.backIconButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.topTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>⏰ Routine Setup</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <View style={styles.infoIconWrap}>
            <Text style={styles.infoIcon}>🍽️</Text>
          </View>
          <View style={styles.infoTextWrap}>
            <Text style={[styles.infoTitle, { fontSize: 27 * textScale, lineHeight: 32 * textScale }]}>Set Your Daily Times</Text>
            <Text style={[styles.infoBody, { fontSize: 16 * textScale, lineHeight: 22 * textScale }]}>Medicine reminders follow these times.</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.voiceSetupButton, isListening && styles.voiceSetupButtonActive]}
          onPress={handleVoiceSetup}
        >
          <Text style={styles.voiceSetupIcon}>🎤</Text>
          <Text style={[styles.voiceSetupText, { fontSize: 19 * textScale }]}>{isListening ? 'Listening... Tap to Stop' : 'Set with Voice'}</Text>
        </TouchableOpacity>

        {!!voiceTranscript && (
          <View style={styles.voiceResultCard}>
            <Text style={[styles.voiceResultLabel, { fontSize: 12 * textScale }]}>Heard</Text>
            <Text style={[styles.voiceResultText, { fontSize: 16 * textScale }]}>{voiceTranscript}</Text>
          </View>
        )}

        {cards.map((item) => (
          <View
            key={item.key}
            style={[
              styles.timeCard,
              {
                backgroundColor: item.backgroundColor,
                borderColor: item.borderColor,
              },
            ]}
          >
            <View style={[styles.timeIconWrap, { backgroundColor: item.accentColor }]}>
              <Text style={styles.timeIcon}>{item.icon}</Text>
            </View>
            <View style={styles.timeTextWrap}>
              <Text style={[styles.timeLabel, { fontSize: 20 * textScale, lineHeight: 25 * textScale }]}>{item.label}</Text>
              <Text style={[styles.timeSubtitle, { fontSize: 14 * textScale, lineHeight: 18 * textScale }]}>{item.subtitle}</Text>
              <Text style={[styles.timeValue, { fontSize: 31 * textScale, lineHeight: 37 * textScale }]}>{item.time}</Text>
            </View>
            <TouchableOpacity
              style={[styles.clockWrap, { borderColor: item.borderColor }]}
              onPress={() => openTimePicker(item.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Change ${item.label} time`}
            >
              <Text style={styles.clockIcon}>🕒</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.tipBox}>
          <Text style={styles.tipBullet}>💡</Text>
          <Text style={[styles.tipText, { fontSize: 15 * textScale, lineHeight: 20 * textScale }]}>Tap a clock to change a time.</Text>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
          <Text style={[styles.saveButtonText, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>{isSaving ? 'Saving...' : '✓ Save Routine'}</Text>
        </TouchableOpacity>

      </ScrollView>

      {showTimePicker && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <View style={styles.pickerHeaderIconWrap}>
                <Text style={styles.pickerHeaderIcon}>{selectedMeal?.icon || '⏰'}</Text>
              </View>
              <View style={styles.pickerHeaderTextWrap}>
                <Text style={[styles.pickerMealLabel, { fontSize: 16 * textScale, lineHeight: 20 * textScale }]}>{selectedMeal?.label || 'Time'}</Text>
                <Text style={[styles.pickerTitle, { fontSize: 25 * textScale, lineHeight: 31 * textScale }]}>Choose Time</Text>
              </View>
            </View>

            <View style={styles.pickerTimePreview}>
              <Text style={[styles.pickerTimePreviewLabel, { fontSize: 14 * textScale }]}>Selected time</Text>
              <Text style={[styles.pickerTimePreviewText, { fontSize: 40 * textScale, lineHeight: 48 * textScale }]}>
                {pickerHours}:{pickerMinutes} {pickerPeriod}
              </Text>
            </View>

            <View style={styles.simplePickerInlineRow}>
              <View style={styles.simplePickerInlineCard}>
                <Text style={[styles.simplePickerLabel, { fontSize: 16 * textScale }]}>Hour</Text>
                <View style={styles.simplePickerInlineControls}>
                  <Text style={[styles.simplePickerValue, { fontSize: 29 * textScale, lineHeight: 35 * textScale }]}>{pickerHours}</Text>
                  <View style={styles.simplePickerArrowStack}>
                    <TouchableOpacity
                      onPress={() => adjustPickerHours(1)}
                      style={styles.simplePickerButton}
                      accessibilityRole="button"
                      accessibilityLabel="Increase hour"
                    >
                      <Text style={[styles.simplePickerButtonText, { fontSize: 21 * textScale }]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => adjustPickerHours(-1)}
                      style={styles.simplePickerButton}
                      accessibilityRole="button"
                      accessibilityLabel="Decrease hour"
                    >
                      <Text style={[styles.simplePickerButtonText, { fontSize: 21 * textScale }]}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={styles.simplePickerInlineCard}>
                <Text style={[styles.simplePickerLabel, { fontSize: 16 * textScale }]}>Minute</Text>
                <View style={styles.simplePickerInlineControls}>
                  <Text style={[styles.simplePickerValue, { fontSize: 29 * textScale, lineHeight: 35 * textScale }]}>{pickerMinutes}</Text>
                  <View style={styles.simplePickerArrowStack}>
                    <TouchableOpacity
                      onPress={() => adjustPickerMinutes(1)}
                      style={styles.simplePickerButton}
                      accessibilityRole="button"
                      accessibilityLabel="Increase minutes"
                    >
                      <Text style={[styles.simplePickerButtonText, { fontSize: 21 * textScale }]}>▲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => adjustPickerMinutes(-1)}
                      style={styles.simplePickerButton}
                      accessibilityRole="button"
                      accessibilityLabel="Decrease minutes"
                    >
                      <Text style={[styles.simplePickerButtonText, { fontSize: 21 * textScale }]}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <Text style={[styles.periodPickerLabel, { fontSize: 17 * textScale }]}>Choose morning or evening</Text>
            <View style={styles.periodPickerRow}>
              <TouchableOpacity
                onPress={() => setPickerPeriod('AM')}
                style={[styles.periodPickerButton, pickerPeriod === 'AM' && styles.periodPickerButtonActive]}
                accessibilityRole="button"
                accessibilityLabel="Morning AM"
              >
                <Text style={[styles.periodPickerText, pickerPeriod === 'AM' && styles.periodPickerTextActive, { fontSize: 18 * textScale }]}>AM</Text>
                <Text style={[styles.periodPickerSubText, pickerPeriod === 'AM' && styles.periodPickerTextActive, { fontSize: 12 * textScale }]}>Morning</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPickerPeriod('PM')}
                style={[styles.periodPickerButton, pickerPeriod === 'PM' && styles.periodPickerButtonActive]}
                accessibilityRole="button"
                accessibilityLabel="Evening PM"
              >
                <Text style={[styles.periodPickerText, pickerPeriod === 'PM' && styles.periodPickerTextActive, { fontSize: 18 * textScale }]}>PM</Text>
                <Text style={[styles.periodPickerSubText, pickerPeriod === 'PM' && styles.periodPickerTextActive, { fontSize: 12 * textScale }]}>Evening</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pickerButtonRow}>
              <TouchableOpacity
                style={styles.pickerCancelButton}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={[styles.pickerCancelText, { fontSize: 20 * textScale }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickerConfirmButton}
                onPress={saveTimeFromPicker}
              >
                <Text style={[styles.pickerConfirmText, { fontSize: 20 * textScale }]}>Set</Text>
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
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f7efe4',
  },
  loaderText: {
    marginTop: 12,
    color: '#5d5045',
    fontSize: 15,
  },
  topBar: {
    minHeight: 58,
    marginHorizontal: 14,
    marginTop: 26,
    marginBottom: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2f5d50',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#f4cf75',
    shadowColor: '#20382f',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  backIconButton: {
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
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: '#ffffff',
    paddingHorizontal: 8,
  },
  headerRightSpacer: {
    width: 46,
    height: 46,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  infoCard: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#f4cf75',
    backgroundColor: '#2f5d50',
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#315a4f',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  infoIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: '#f8d978',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 2,
    borderColor: '#fff4c6',
  },
  infoIcon: {
    fontSize: 30,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    color: '#ffffff',
  },
  infoBody: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: '#e9f7f1',
  },
  voiceSetupButton: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  voiceSetupButtonActive: {
    backgroundColor: '#e9f7f1',
    borderColor: '#a8dbc8',
  },
  voiceSetupIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  voiceSetupText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#2f5d50',
  },
  voiceResultCard: {
    borderWidth: 1,
    borderColor: '#a8dbc8',
    borderRadius: 16,
    backgroundColor: '#fffdf8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  voiceResultLabel: {
    color: '#5f7386',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  voiceResultText: {
    color: '#1f2c3a',
    fontSize: 16,
    fontWeight: '600',
  },
  timeCard: {
    borderWidth: 1,
    borderRadius: 20,
    minHeight: 112,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  timeIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  timeIcon: {
    fontSize: 29,
  },
  timeTextWrap: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: 0,
    color: '#24352f',
  },
  timeSubtitle: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 18,
    color: '#74665b',
    fontWeight: '700',
  },
  timeValue: {
    marginTop: 6,
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '900',
    color: '#2f5d50',
  },
  clockWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockIcon: {
    fontSize: 24,
  },
  tipBox: {
    marginTop: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipBullet: {
    fontSize: 22,
    marginRight: 8,
  },
  tipText: {
    flex: 1,
    color: '#5d5045',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  saveButton: {
    marginTop: 16,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#17382f',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 22,
    lineHeight: 28,
    color: '#ffffff',
    fontWeight: '900',
  },
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(31, 44, 39, 0.58)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  pickerModal: {
    width: '100%',
    backgroundColor: '#fff8ed',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: '#f4cf75',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  pickerHeader: {
    minHeight: 76,
    borderRadius: 22,
    backgroundColor: '#2f5d50',
    borderWidth: 2,
    borderColor: '#f4cf75',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  pickerHeaderIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#f8d978',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pickerHeaderIcon: {
    fontSize: 28,
  },
  pickerHeaderTextWrap: {
    flex: 1,
  },
  pickerMealLabel: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: '#e9f7f1',
  },
  pickerTitle: {
    marginTop: 2,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    color: '#ffffff',
  },
  pickerTimePreview: {
    minHeight: 88,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#f4cf75',
    backgroundColor: '#e9f7f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#315a4f',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  pickerTimePreviewText: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '900',
    color: '#2f5d50',
    textAlign: 'center',
  },
  pickerTimePreviewLabel: {
    marginBottom: 4,
    fontSize: 14,
    color: '#5d5045',
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  simplePickerInlineRow: {
    flexDirection: 'row',
    columnGap: 10,
    marginBottom: 12,
  },
  simplePickerInlineCard: {
    flex: 1,
    minHeight: 104,
    borderRadius: 22,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  simplePickerInlineControls: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  simplePickerLabel: {
    fontSize: 17,
    fontWeight: '900',
    color: '#5d5045',
    textAlign: 'center',
  },
  simplePickerArrowStack: {
    width: 46,
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 6,
  },
  simplePickerButton: {
    width: 42,
    height: 32,
    borderRadius: 13,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simplePickerButtonText: {
    fontSize: 21,
    lineHeight: 25,
    color: '#ffffff',
    fontWeight: '900',
  },
  simplePickerValue: {
    flex: 1,
    minHeight: 70,
    marginRight: 8,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#f4cf75',
    backgroundColor: '#e9f7f1',
    color: '#24352f',
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '900',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingVertical: 17,
  },
  periodPickerRow: {
    flexDirection: 'row',
    columnGap: 10,
    marginBottom: 18,
  },
  periodPickerLabel: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 17,
    fontWeight: '900',
    color: '#5d5045',
  },
  periodPickerButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodPickerButtonActive: {
    borderColor: '#2f5d50',
    backgroundColor: '#2f5d50',
  },
  periodPickerText: {
    fontSize: 18,
    color: '#5d5045',
    fontWeight: '900',
  },
  periodPickerSubText: {
    marginTop: 2,
    fontSize: 12,
    color: '#74665b',
    fontWeight: '800',
  },
  periodPickerTextActive: {
    color: '#ffffff',
  },
  pickerButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerCancelButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pickerCancelText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#5d5045',
  },
  pickerConfirmButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  pickerConfirmText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
  },
});

export default RoutineSetupScreen;
