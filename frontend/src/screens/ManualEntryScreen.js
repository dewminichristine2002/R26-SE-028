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

const ManualEntryScreen = ({ onBack }) => {
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

      Alert.alert('Saved', 'Medicine details saved successfully.');
      onBack?.();
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
        <Text style={styles.headerTitle}>Manual Entry</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.fieldLabel}>Which medicine?</Text>
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
        style={styles.input}
        placeholder="Start typing medicine name (e.g. Aspirin)"
        placeholderTextColor="#8d98a3"
        returnKeyType="done"
        onSubmitEditing={handleSubmitMedicineName}
      />

      {!!selectedMedicineName && (
        <View style={styles.selectedMedicineCard}>
          <Text style={styles.selectedMedicineLabel}>Selected Medicine</Text>
          <Text style={styles.selectedMedicineValue}>{selectedMedicineName}</Text>
        </View>
      )}

      {isLoadingColors ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#2e8ec8" />
          <Text style={styles.loadingText}>Loading available color and shape...</Text>
        </View>
      ) : null}

      {!isLoadingColors && availableAppearances.length > 0 && (
        <View style={styles.colorPickerCard}>
          <Text style={styles.colorPickerTitle}>
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
                <Text style={[styles.colorChipText, isActive && styles.colorChipTextActive]}>{item.color} / {item.shape}</Text>
              </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {isLoadingSuggestions ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#2e8ec8" />
          <Text style={styles.loadingText}>Loading suggestions...</Text>
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
              <Text style={styles.suggestionText}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {!!suggestionError && <Text style={styles.errorText}>{suggestionError}</Text>}
      {!!colorError && <Text style={styles.errorText}>{colorError}</Text>}

      <View style={styles.dualInputRow}>
        <View style={styles.miniField}>
          <Text style={styles.miniFieldLabel}>Total Quantity</Text>
          <View style={styles.miniFieldValueRow}>
            <TextInput
              value={totalQuantity}
              onChangeText={setTotalQuantity}
              keyboardType="number-pad"
              style={styles.miniFieldInput}
              maxLength={4}
            />
            <Text style={styles.miniFieldUnit}>TABS</Text>
          </View>
        </View>

        <View style={styles.miniField}>
          <Text style={styles.miniFieldLabel}>Dosage</Text>
          <View style={styles.miniFieldValueRow}>
            <TextInput
              value={dosageMg}
              onChangeText={setDosageMg}
              keyboardType="number-pad"
              style={styles.miniFieldInput}
              maxLength={4}
            />
            <Text style={styles.miniFieldUnit}>MG</Text>
          </View>
        </View>
      </View>

      <View style={styles.scheduleCard}>
        <Text style={styles.scheduleTitle}>Dosage & Schedule</Text>

        <Text style={styles.sectionCaption}>DAILY AMOUNT</Text>
        <View style={styles.amountRow}>
          <View style={styles.amountValuePill}>
            <TextInput
              value={dailyAmount}
              onChangeText={setDailyAmount}
              keyboardType="number-pad"
              style={styles.amountValueInput}
              maxLength={2}
            />
            <Text style={styles.amountValueText}>Pills</Text>
          </View>

          {['Tablet', 'Drops'].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.chipButton, doseForm === item && styles.chipButtonActive]}
              onPress={() => setDoseForm(item)}
            >
              <Text style={[styles.chipButtonText, doseForm === item && styles.chipButtonTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionCaption, styles.takeWithLabel]}>TAKE WITH:</Text>
        <View style={styles.mealGrid}>
          {['Breakfast', 'Lunch', 'Dinner', 'Before Sleep'].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.mealButton, takeWithOptions.includes(item) && styles.mealButtonActive]}
              onPress={() => toggleTakeWithOption(item)}
            >
              <Text style={[styles.mealButtonText, takeWithOptions.includes(item) && styles.mealButtonTextActive]}>{item.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.howSection}>
        <Text style={styles.howSectionTitle}>How does it get?</Text>
        <View style={styles.howButtonsRow}>
          {['Before', 'After'].map((item) => (
            <TouchableOpacity
              key={item}
              style={[styles.howButton, intakeTiming === item && styles.howButtonActive]}
              onPress={() => setIntakeTiming(item)}
            >
              <Text style={[styles.howButtonText, intakeTiming === item && styles.howButtonTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.safetyCard}>
        <Text style={styles.safetyTitle}>Safety Verification</Text>
        <Text style={styles.safetyBody}>
          Based on your routine, taking this with {takeWithOptions.length} meal{takeWithOptions.length > 1 ? 's' : ''} is being scheduled. We will remind you 30 minutes before each.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.finishButton, isFormValid && styles.finishButtonEnabled]}
        onPress={handleFinish}
        disabled={isSaving}
      >
        <Text style={[styles.finishButtonText, isFormValid && styles.finishButtonTextEnabled]}>
          {isSaving ? 'Saving...' : 'Finish & Add Medicine'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.footerNote}>You can always edit these details later in the Meds tab.</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f6f8fb',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
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
    backgroundColor: '#ecf2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: '#445a6d',
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 19,
    color: '#202833',
    fontWeight: '700',
  },
  headerSpacer: {
    width: 34,
    height: 34,
  },
  fieldLabel: {
    fontSize: 17,
    color: '#1f2f42',
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#d8dee6',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#1f2f3d',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dce5ed',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  suggestionItem: {
    minHeight: 44,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cfe4f6',
    backgroundColor: '#eef7ff',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe5ef',
    backgroundColor: '#ffffff',
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
    height: 34,
    borderRadius: 17,
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
    borderColor: '#2f8fd0',
    backgroundColor: '#ebf5ff',
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dce3eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 10,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d6dee7',
    backgroundColor: '#ffffff',
    padding: 12,
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
    backgroundColor: '#f3f5f8',
    borderRadius: 12,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e5eb',
    backgroundColor: '#f6f7f9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
  },
  chipButtonActive: {
    backgroundColor: '#e8f3ff',
    borderColor: '#8fc3ef',
  },
  chipButtonText: {
    color: '#728495',
    fontSize: 13,
    fontWeight: '700',
  },
  chipButtonTextActive: {
    color: '#2985ca',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d8dfe7',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  mealButtonActive: {
    backgroundColor: '#8fc8fa',
    borderColor: '#8fc8fa',
  },
  mealButtonText: {
    fontSize: 11,
    color: '#4f6170',
    fontWeight: '700',
  },
  mealButtonTextActive: {
    color: '#21415d',
  },
  howSection: {
    marginTop: 14,
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
    height: 44,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#d5dde6',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  howButtonActive: {
    borderColor: '#273645',
    backgroundColor: '#ffffff',
  },
  howButtonText: {
    color: '#697988',
    fontSize: 14,
    fontWeight: '700',
  },
  howButtonTextActive: {
    color: '#253443',
  },
  safetyCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bcdcf6',
    backgroundColor: '#eaf5ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#f0f2f5',
    borderWidth: 1,
    borderColor: '#e6eaef',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonEnabled: {
    backgroundColor: '#2f8fd0',
    borderColor: '#2f8fd0',
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
