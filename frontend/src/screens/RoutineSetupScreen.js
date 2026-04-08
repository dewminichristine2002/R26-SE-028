import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { routineService } from '../services/routineService';

const routineRows = [
  { key: 'breakfast', label: 'BREAKFAST', icon: '☀️' },
  { key: 'lunch', label: 'LUNCH', icon: '🌤️' },
  { key: 'dinner', label: 'DINNER', icon: '🌆' },
  { key: 'sleep', label: 'SLEEP', icon: '🌙' },
];

const RoutineSetupScreen = ({ onBackToMenu }) => {
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
        <ActivityIndicator size="large" color="#2c8de0" />
        <Text style={styles.loaderText}>Loading your routine...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBackToMenu} style={styles.backIconButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Routine Setup</Text>
        <TouchableOpacity style={styles.voiceIconButton}>
          <Text style={styles.voiceIcon}>🔊</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Let's personalize your schedule</Text>
          <Text style={styles.infoBody}>
            Reminders will follow your meal times so you never miss a dose. It's the easiest way to stay on track.
          </Text>
        </View>

        <TouchableOpacity style={styles.voiceSetupButton}>
          <Text style={styles.voiceSetupIcon}>🎤</Text>
          <Text style={styles.voiceSetupText}>Set with Voice</Text>
        </TouchableOpacity>

        {cards.map((item, index) => (
          <View
            key={item.key}
            style={[styles.timeCard, index === 0 && styles.activeTimeCard]}
          >
            <View style={[styles.timeIconWrap, index === 0 && styles.activeTimeIconWrap]}>
              <Text style={styles.timeIcon}>{item.icon}</Text>
            </View>
            <View style={styles.timeTextWrap}>
              <Text style={styles.timeLabel}>{item.label}</Text>
              <Text style={styles.timeValue}>{item.time}</Text>
            </View>
            <TouchableOpacity
              style={styles.clockWrap}
              onPress={() => openTimePicker(item.key)}
              activeOpacity={0.7}
            >
              <Text style={styles.clockIcon}>🕒</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.tipBox}>
          <Text style={styles.tipBullet}>›</Text>
          <Text style={styles.tipText}>Tap the clock icon to set your preferred meal or sleep time.</Text>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={isSaving}>
          <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save Routine'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={onBackToMenu}>
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>

      {showTimePicker && (
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Set Time</Text>

            <View style={styles.pickerControls}>
              <View style={styles.pickerColumn}>
                <TouchableOpacity onPress={() => adjustPickerHours(1)} style={styles.pickerUpButton}>
                  <Text style={styles.pickerUpArrow}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.pickerValue}>{pickerHours}</Text>
                <TouchableOpacity onPress={() => adjustPickerHours(-1)} style={styles.pickerDownButton}>
                  <Text style={styles.pickerDownArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.pickerSeparator}>:</Text>

              <View style={styles.pickerColumn}>
                <TouchableOpacity onPress={() => adjustPickerMinutes(1)} style={styles.pickerUpButton}>
                  <Text style={styles.pickerUpArrow}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.pickerValue}>{pickerMinutes}</Text>
                <TouchableOpacity onPress={() => adjustPickerMinutes(-1)} style={styles.pickerDownButton}>
                  <Text style={styles.pickerDownArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.pickerColumn}>
                <TouchableOpacity
                  onPress={() => setPickerPeriod(pickerPeriod === 'AM' ? 'PM' : 'AM')}
                  style={styles.pickerPeriodButton}
                >
                  <Text style={styles.pickerValue}>{pickerPeriod}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.pickerButtonRow}>
              <TouchableOpacity
                style={styles.pickerCancelButton}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickerConfirmButton}
                onPress={saveTimeFromPicker}
              >
                <Text style={styles.pickerConfirmText}>Set</Text>
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
    backgroundColor: '#f3f5f8',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f5f8',
  },
  loaderText: {
    marginTop: 12,
    color: '#536272',
    fontSize: 15,
  },
  topBar: {
    height: 72,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#ebedf0',
  },
  backIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f2f6fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 26,
    color: '#3a5268',
    marginTop: -2,
  },
  topTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#1f2732',
  },
  voiceIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eef7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceIcon: {
    fontSize: 17,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d2dbe5',
    backgroundColor: '#eaf2fb',
    padding: 14,
    marginBottom: 14,
  },
  infoTitle: {
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '700',
    color: '#152739',
    marginBottom: 8,
  },
  infoBody: {
    fontSize: 21,
    lineHeight: 27,
    color: '#4c6277',
  },
  voiceSetupButton: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2e97e4',
    backgroundColor: '#e9f5ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 12,
  },
  voiceSetupIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  voiceSetupText: {
    fontSize: 19,
    fontWeight: '700',
    color: '#2a81c7',
  },
  timeCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e5eb',
    borderRadius: 14,
    minHeight: 82,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeTimeCard: {
    borderColor: '#2895e1',
    shadowColor: '#2386d0',
    shadowOpacity: 0.12,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  timeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f3f7',
    marginRight: 10,
  },
  activeTimeIconWrap: {
    backgroundColor: '#2b92df',
  },
  timeIcon: {
    fontSize: 19,
  },
  timeTextWrap: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#66788a',
  },
  timeValue: {
    marginTop: 3,
    fontSize: 31,
    fontWeight: '700',
    color: '#1f2c3a',
  },
  clockWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#d8dde4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockIcon: {
    fontSize: 16,
  },
  tipBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e1e4e8',
    paddingTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tipBullet: {
    color: '#d4b888',
    fontSize: 21,
    marginRight: 8,
    marginTop: -1,
  },
  tipText: {
    flex: 1,
    color: '#7a838d',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  saveButton: {
    marginTop: 16,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#2d89df',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 27,
    color: '#ffffff',
    fontWeight: '700',
  },
  skipButton: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 26,
    color: '#2c3948',
    fontWeight: '500',
  },
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  pickerModal: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  pickerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2732',
    marginBottom: 20,
    textAlign: 'center',
  },
  pickerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  pickerColumn: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  pickerUpButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickerUpArrow: {
    fontSize: 22,
    color: '#2d89df',
    fontWeight: '700',
  },
  pickerValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1f2732',
    minWidth: 60,
    textAlign: 'center',
  },
  pickerDownButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickerDownArrow: {
    fontSize: 22,
    color: '#2d89df',
    fontWeight: '700',
  },
  pickerSeparator: {
    fontSize: 42,
    fontWeight: '700',
    color: '#1f2732',
    marginHorizontal: 4,
    marginBottom: 20,
  },
  pickerPeriodButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  pickerButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pickerCancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#ebedf0',
    alignItems: 'center',
    marginRight: 8,
  },
  pickerCancelText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#536272',
  },
  pickerConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#2d89df',
    alignItems: 'center',
    marginLeft: 8,
  },
  pickerConfirmText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default RoutineSetupScreen;
