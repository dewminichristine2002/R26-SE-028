import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { medicationService } from '../services/medicationService';
import { reminderNotificationService } from '../services/reminderNotificationService';

const ManualEntryScreen = ({ onBack, initialData, onSaved, reminderTextScale = 1 }) => {
  const [medicineQuery, setMedicineQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [selectedMedicineName, setSelectedMedicineName] = useState('');
  const [availableAppearances, setAvailableAppearances] = useState([]);
  const [availableColors, setAvailableColors] = useState([]);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedShape, setSelectedShape] = useState('');
  const [isLoadingColors, setIsLoadingColors] = useState(false);
  const [colorError, setColorError] = useState('');
  const [doseForm, setDoseForm] = useState('Tablet');
  const [takeWithOptions, setTakeWithOptions] = useState(['Breakfast']);
  const [intakeTiming, setIntakeTiming] = useState('After');
  const [totalQuantity, setTotalQuantity] = useState('30');
  const [dosageMg, setDosageMg] = useState('20');
  const [dailyAmount, setDailyAmount] = useState('1');
  const [isSaving, setIsSaving] = useState(false);
  const textScale = reminderTextScale || 1;

  useEffect(() => {
    if (!initialData) {
      return;
    }

    const incomingName = String(initialData.medicineName || '').trim();
    const incomingDosage = String(initialData.dosageMg || '').trim();
    const incomingQuantity = String(initialData.totalQuantity || '').trim();
    const incomingDaily = String(initialData.dailyAmount || '').trim();

    if (incomingName) {
      setMedicineQuery(incomingName);
      setSelectedMedicineName(incomingName);
    }
    if (incomingDosage) {
      setDosageMg(incomingDosage);
    }
    if (incomingQuantity) {
      setTotalQuantity(incomingQuantity);
    }
    if (incomingDaily) {
      setDailyAmount(incomingDaily);
    }
  }, [initialData]);

  useEffect(() => {
    if (!medicineQuery.trim()) {
      setSuggestions([]);
      return undefined;
    }

    let isCancelled = false;
    setIsLoadingSuggestions(true);
    setSuggestionError('');

    const timeoutId = setTimeout(async () => {
      try {
        const nextSuggestions = await medicationService.getSuggestions(medicineQuery);
        if (!isCancelled) {
          setSuggestions(nextSuggestions);
        }
      } catch (error) {
        if (!isCancelled) {
          setSuggestions([]);
          setSuggestionError(error?.response?.data?.error || error?.message || 'Could not load suggestions');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSuggestions(false);
        }
      }
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [medicineQuery]);

  const handlePickSuggestion = (item) => {
    setMedicineQuery(item.name);
    setSelectedMedicineName(item.name);
    setSuggestions([]);
    setColorError('');
  };

  const handleSubmitMedicineName = () => {
    const trimmed = medicineQuery.trim();
    if (!trimmed) {
      return;
    }

    setSelectedMedicineName(trimmed);
    setSuggestions([]);
    setColorError('');
  };

  useEffect(() => {
    const confirmedName = (selectedMedicineName || '').trim();

    if (!confirmedName) {
      setAvailableAppearances([]);
      setAvailableColors([]);
      setSelectedColor('');
      setSelectedShape('');
      setColorError('');
      setIsLoadingColors(false);
      return;
    }

    let isCancelled = false;

    const loadColors = async () => {
      setIsLoadingColors(true);
      setColorError('');

      try {
        const appearances = await medicationService.getAppearancesForMedicineName(confirmedName);
        if (isCancelled) {
          return;
        }

        setAvailableAppearances(appearances);
        const colors = Array.from(new Set(appearances.map((item) => item.color).filter(Boolean)));
        setAvailableColors(colors);

        if (!appearances.length) {
          setSelectedColor('');
          setSelectedShape('');
        } else if (appearances.length === 1) {
          setSelectedColor(appearances[0].color);
          setSelectedShape(appearances[0].shape);
        } else {
          setSelectedColor((prevColor) => {
            const hasColor = appearances.some((item) => item.color === prevColor);
            return hasColor ? prevColor : '';
          });
          setSelectedShape((prevShape) => {
            const hasShape = appearances.some((item) => item.shape === prevShape);
            return hasShape ? prevShape : '';
          });
        }
      } catch (error) {
        if (!isCancelled) {
          setAvailableAppearances([]);
          setAvailableColors([]);
          setSelectedColor('');
          setSelectedShape('');
          setColorError(error?.response?.data?.error || error?.message || 'Could not load medicine colors and shapes');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingColors(false);
        }
      }
    };

    loadColors();

    return () => {
      isCancelled = true;
    };
  }, [selectedMedicineName]);

  const resolvedMedicineName = (selectedMedicineName || medicineQuery).trim();
  const selectedTakeWith = takeWithOptions.join(', ');
  const needsAppearanceSelection = availableAppearances.length > 1;

  const isFormValid =
    !!resolvedMedicineName &&
    (!needsAppearanceSelection || (!!selectedColor && !!selectedShape)) &&
    Number(totalQuantity) > 0 &&
    Number(dosageMg) > 0 &&
    Number(dailyAmount) > 0 &&
    !!doseForm &&
    takeWithOptions.length > 0 &&
    !!intakeTiming;

  const toggleTakeWithOption = (option) => {
    setTakeWithOptions((prev) => {
      if (prev.includes(option)) {
        const updated = prev.filter((item) => item !== option);
        return updated.length ? updated : prev;
      }

      return [...prev, option];
    });
  };

  const handleFinish = async () => {
    if (!isFormValid) {
      Alert.alert('Missing Data', 'Please fill all fields before finishing.');
      return;
    }

    try {
      setIsSaving(true);

      await medicationService.saveMedication({
        medicineName: resolvedMedicineName,
        selectedColor,
        selectedShape,
        totalQuantity: Number(totalQuantity),
        dosageMg: Number(dosageMg),
        dailyAmount: Number(dailyAmount),
        doseForm,
        takeWith: selectedTakeWith,
        intakeTiming,
      });

      try {
        await reminderNotificationService.rescheduleDailyReminders();
      } catch (notificationError) {
        console.log('[ManualEntry] Reminder reschedule failed:', notificationError?.message || notificationError);
      }

      Alert.alert('Saved', 'Medicine details saved successfully.');
      const shouldClose = onSaved
        ? onSaved({
          medicineName: resolvedMedicineName,
          dosageMg: Number(dosageMg),
          totalQuantity: Number(totalQuantity),
          dailyAmount: Number(dailyAmount),
        })
        : true;
      if (shouldClose !== false) {
        onBack?.();
      }
    } catch (error) {
      Alert.alert('Save Failed', error?.response?.data?.error || error?.message || 'Could not save medicine details.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>💊 Add Medicine</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.helperCard}>
        <View style={styles.helperTextWrap}>
          <Text style={[styles.helperTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>Medicine name</Text>
          <Text style={[styles.helperText, { fontSize: 16 * textScale, lineHeight: 22 * textScale }]}>Type and select your medicine.</Text>
        </View>
      </View>

      <Text style={[styles.fieldLabel, { fontSize: 18 * textScale }]}>Medicine name</Text>
      <TextInput
        value={medicineQuery}
        onChangeText={(value) => {
          setMedicineQuery(value);
          if (selectedMedicineName && value.trim() !== selectedMedicineName) {
            setSelectedMedicineName('');
            setAvailableAppearances([]);
            setAvailableColors([]);
            setSelectedColor('');
            setSelectedShape('');
            setColorError('');
          }
        }}
        style={[styles.input, { fontSize: 17 * textScale }]}
        placeholder="Type medicine name"
        placeholderTextColor="#8d98a3"
        returnKeyType="done"
        onSubmitEditing={handleSubmitMedicineName}
      />

      {!!selectedMedicineName && (
        <View style={styles.selectedMedicineCard}>
          <Text style={[styles.selectedMedicineLabel, { fontSize: 12 * textScale }]}>Selected Medicine</Text>
          <Text style={[styles.selectedMedicineValue, { fontSize: 18 * textScale }]}>{selectedMedicineName}</Text>
        </View>
      )}

      {isLoadingColors ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#2e8ec8" />
          <Text style={[styles.loadingText, { fontSize: 14 * textScale }]}>Loading available color and shape...</Text>
        </View>
      ) : null}

      {!isLoadingColors && availableAppearances.length > 0 && (
        <View style={styles.colorPickerCard}>
          <Text style={[styles.colorPickerTitle, { fontSize: 17 * textScale }]}>
            {availableAppearances.length > 1 ? 'Confirm color and shape' : 'Detected appearance'}
          </Text>
          <View style={styles.colorOptionsRow}>
            {availableAppearances.map((item) => {
              const key = `${item.color}-${item.shape}`;
              const isActive = selectedColor === item.color && selectedShape === item.shape;

              return (
              <TouchableOpacity
                key={key}
                style={[styles.colorChip, isActive && styles.colorChipActive]}
                onPress={() => {
                  setSelectedColor(item.color);
                  setSelectedShape(item.shape);
                }}
              >
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <Text style={[styles.colorChipText, isActive && styles.colorChipTextActive, { fontSize: 13 * textScale }]}>{item.color} / {item.shape}</Text>
              </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {isLoadingSuggestions ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#2e8ec8" />
          <Text style={[styles.loadingText, { fontSize: 14 * textScale }]}>Loading suggestions...</Text>
        </View>
      ) : null}

      {suggestions.length > 0 && (
        <View style={styles.suggestionsCard}>
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.suggestionItem}
              onPress={() => handlePickSuggestion(item)}
            >
              <Text style={[styles.suggestionText, { fontSize: 16 * textScale }]}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!!suggestionError && <Text style={[styles.errorText, { fontSize: 13 * textScale }]}>{suggestionError}</Text>}
      {!!colorError && <Text style={[styles.errorText, { fontSize: 13 * textScale }]}>{colorError}</Text>}

      <View style={styles.dualInputRow}>
        <View style={styles.miniField}>
          <Text style={[styles.miniFieldLabel, { fontSize: 13 * textScale }]}>Total tablets</Text>
          <View style={styles.miniFieldValueRow}>
            <TextInput
              value={totalQuantity}
              onChangeText={setTotalQuantity}
              keyboardType="number-pad"
              style={[styles.miniFieldInput, { fontSize: 25 * textScale }]}
              maxLength={4}
            />
            <Text style={[styles.miniFieldUnit, { fontSize: 12 * textScale }]}>TABS</Text>
          </View>
        </View>

        <View style={styles.miniField}>
          <Text style={[styles.miniFieldLabel, { fontSize: 13 * textScale }]}>Strength</Text>
          <View style={styles.miniFieldValueRow}>
            <TextInput
              value={dosageMg}
              onChangeText={setDosageMg}
              keyboardType="number-pad"
              style={[styles.miniFieldInput, { fontSize: 25 * textScale }]}
              maxLength={4}
            />
            <Text style={[styles.miniFieldUnit, { fontSize: 12 * textScale }]}>MG</Text>
          </View>
        </View>
      </View>

      <View style={styles.scheduleCard}>
        <Text style={[styles.scheduleTitle, { fontSize: 22 * textScale }]}>How to take</Text>

        <Text style={[styles.sectionCaption, { fontSize: 12 * textScale }]}>Tablets each time</Text>
        <View style={styles.amountRow}>
          <View style={styles.amountValuePill}>
            <TextInput
              value={dailyAmount}
              onChangeText={setDailyAmount}
              keyboardType="number-pad"
              style={[styles.amountValueInput, { fontSize: 25 * textScale }]}
              maxLength={2}
            />
            <Text style={[styles.amountValueText, { fontSize: 15 * textScale }]}>Pills</Text>
          </View>

          {['Tablet', 'Drops'].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.chipButton, doseForm === item && styles.chipButtonActive]}
              onPress={() => setDoseForm(item)}
            >
              <Text style={[styles.chipButtonText, doseForm === item && styles.chipButtonTextActive, { fontSize: 16 * textScale }]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionCaption, styles.takeWithLabel, { fontSize: 12 * textScale }]}>Take with</Text>
        <View style={styles.mealGrid}>
          {['Breakfast', 'Lunch', 'Dinner', 'Before Sleep'].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.mealButton, takeWithOptions.includes(item) && styles.mealButtonActive]}
              onPress={() => toggleTakeWithOption(item)}
            >
              <Text style={[styles.mealButtonText, takeWithOptions.includes(item) && styles.mealButtonTextActive, { fontSize: 13 * textScale }]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.howSection}>
        <Text style={[styles.howSectionTitle, { fontSize: 18 * textScale }]}>Meal time</Text>
        <View style={styles.howButtonsRow}>
          {['Before', 'After'].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.howButton, intakeTiming === item && styles.howButtonActive]}
              onPress={() => setIntakeTiming(item)}
            >
              <Text style={[styles.howButtonText, intakeTiming === item && styles.howButtonTextActive, { fontSize: 17 * textScale }]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.safetyCard}>
        <Text style={[styles.safetyTitle, { fontSize: 17 * textScale }]}>Safety Verification</Text>
        <Text style={[styles.safetyBody, { fontSize: 14 * textScale }]}>
          Reminder will follow your routine time.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.finishButton, isFormValid && styles.finishButtonEnabled]}
        onPress={handleFinish}
        disabled={isSaving}
      >
        <Text style={[styles.finishButtonText, isFormValid && styles.finishButtonTextEnabled, { fontSize: 17 * textScale }]}>
          {isSaving ? 'Saving...' : '✓ Save Medicine'}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.footerNote, { fontSize: 13 * textScale }]}>You can edit later in Medicine List.</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f7efe4',
    paddingHorizontal: 14,
    paddingTop: 26,
    paddingBottom: 28,
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
  headerSpacer: {
    width: 46,
    height: 46,
  },
  helperCard: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  helperIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#f8d978',
    color: '#2d241d',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    textAlignVertical: 'center',
    marginRight: 14,
  },
  helperTextWrap: {
    flex: 1,
  },
  helperTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: '#2d241d',
    fontWeight: '900',
  },
  helperText: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 22,
    color: '#74665b',
    fontWeight: '700',
  },
  fieldLabel: {
    fontSize: 17,
    color: '#2d241d',
    fontWeight: '900',
    marginBottom: 8,
  },
  input: {
    minHeight: 56,
    borderWidth: 2,
    borderColor: '#eadcca',
    borderRadius: 18,
    backgroundColor: '#fffdf8',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#24352f',
    fontWeight: '800',
  },
  loadingBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    marginLeft: 8,
    color: '#496071',
    fontSize: 13,
  },
  suggestionsCard: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#a8dbc8',
    backgroundColor: '#fffdf8',
    overflow: 'hidden',
  },
  suggestionItem: {
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f6',
  },
  suggestionText: {
    color: '#1f2f3d',
    fontSize: 15,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 8,
    color: '#c0392b',
    fontSize: 13,
    fontWeight: '600',
  },
  selectedMedicineCard: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#a8dbc8',
    backgroundColor: '#e9f7f1',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedMedicineLabel: {
    fontSize: 12,
    color: '#4e6a80',
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  selectedMedicineValue: {
    fontSize: 16,
    color: '#173247',
    fontWeight: '700',
  },
  colorPickerCard: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  colorPickerTitle: {
    fontSize: 12,
    color: '#586f82',
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  colorOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  colorChip: {
    minHeight: 42,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7e0e9',
    backgroundColor: '#f9fbfe',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  colorChipActive: {
    borderColor: '#2f5d50',
    backgroundColor: '#e9f7f1',
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#c6d2de',
    marginRight: 6,
  },
  colorChipText: {
    color: '#506172',
    fontSize: 12,
    fontWeight: '700',
  },
  colorChipTextActive: {
    color: '#20679f',
  },
  dualInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  miniField: {
    width: '48%',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  miniFieldLabel: {
    fontSize: 11,
    color: '#607181',
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  miniFieldValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  miniFieldInput: {
    minWidth: 52,
    fontSize: 21,
    color: '#273646',
    fontWeight: '700',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  miniFieldUnit: {
    marginLeft: 8,
    fontSize: 11,
    color: '#6b7c8b',
    fontWeight: '700',
  },
  scheduleCard: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#f4cf75',
    backgroundColor: '#fffdf8',
    padding: 14,
  },
  scheduleTitle: {
    fontSize: 17,
    color: '#27384a',
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionCaption: {
    fontSize: 11,
    color: '#7a8898',
    fontWeight: '700',
    marginBottom: 7,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  amountValuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e9f7f1',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  amountValueInput: {
    minWidth: 28,
    fontSize: 20,
    fontWeight: '700',
    color: '#232f3d',
    marginRight: 6,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  amountValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4f6171',
  },
  chipButton: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
  },
  chipButtonActive: {
    backgroundColor: '#2f5d50',
    borderColor: '#2f5d50',
  },
  chipButtonText: {
    color: '#728495',
    fontSize: 13,
    fontWeight: '700',
  },
  chipButtonTextActive: {
    color: '#ffffff',
  },
  takeWithLabel: {
    marginTop: 4,
  },
  mealGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  mealButton: {
    width: '48.5%',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  mealButtonActive: {
    backgroundColor: '#e9f7f1',
    borderColor: '#2f5d50',
  },
  mealButtonText: {
    fontSize: 11,
    color: '#4f6170',
    fontWeight: '700',
  },
  mealButtonTextActive: {
    color: '#2f5d50',
  },
  howSection: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    padding: 14,
  },
  howSectionTitle: {
    fontSize: 22,
    color: '#253446',
    fontWeight: '700',
    marginBottom: 8,
  },
  howButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  howButton: {
    width: '48.5%',
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howButtonActive: {
    borderColor: '#2f5d50',
    backgroundColor: '#2f5d50',
  },
  howButtonText: {
    color: '#697988',
    fontSize: 14,
    fontWeight: '700',
  },
  howButtonTextActive: {
    color: '#ffffff',
  },
  safetyCard: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#b9d4f2',
    backgroundColor: '#eaf4ff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  safetyTitle: {
    color: '#325a7e',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  safetyBody: {
    color: '#4f6a80',
    fontSize: 12,
    lineHeight: 16,
  },
  finishButton: {
    marginTop: 16,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#f0f2f5',
    borderWidth: 1,
    borderColor: '#e6eaef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonEnabled: {
    backgroundColor: '#2f5d50',
    borderColor: '#2f5d50',
  },
  finishButtonText: {
    color: '#9ba7b4',
    fontSize: 17,
    fontWeight: '700',
  },
  finishButtonTextEnabled: {
    color: '#ffffff',
  },
  footerNote: {
    marginTop: 10,
    fontSize: 11,
    color: '#8a97a3',
    textAlign: 'center',
  },
});

export default ManualEntryScreen;
