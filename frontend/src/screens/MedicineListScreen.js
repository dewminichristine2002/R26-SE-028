import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import AgenticGlowCard from '../components/AgenticGlowCard';
import AgenticScreenFrame from '../components/AgenticScreenFrame';
import { intakeMonitoringService } from '../services/intakeMonitoringService';
import { medicationService } from '../services/medicationService';
import { reminderNotificationService } from '../services/reminderNotificationService';

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

const DOSE_FORM_OPTIONS = ['Tablet', 'Drops'];
const TAKE_WITH_OPTIONS = ['Breakfast', 'Lunch', 'Dinner', 'Before Sleep'];
const TIMING_OPTIONS = ['Before', 'After'];

const parseTakeWith = (value = '') =>
  String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

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

const getExpectedTabletCount = (medication) => Math.max(0.5, Number(medication?.daily_amount) || 1);

const getCountSourceLabel = (source) => (source === 'trained-model' ? 'Model count' : 'Image count');

const getSlotIcon = (slot) =>
  ({
    Breakfast: '☀️',
    Lunch: '🍽️',
    Dinner: '🌙',
    'Before Sleep': '🛏️',
  }[slot] || '⏰');

const getColorValue = (color) => {
  const normalized = (color || '').toString().trim().toLowerCase();
  if (!normalized) {
    return '#d9e8f7';
  }

  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) {
    return normalized;
  }

  return colorMap[normalized] || '#d9e8f7';
};

const MedicineListScreen = ({ onBack, reminderTextScale = 1, highlight = null }) => {
  const scrollRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [medications, setMedications] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedMedication, setSelectedMedication] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    medicineName: '',
    selectedColor: '',
    selectedShape: '',
    totalQuantity: '',
    dosageMg: '',
    dailyAmount: '',
    doseForm: 'Tablet',
    takeWithOptions: ['Breakfast'],
    intakeTiming: 'After',
  });
  const textScale = reminderTextScale || 1;
  const highlightedMedicationName = String(highlight?.value || '').trim().toLowerCase();
  const hasAgenticFrame = !!highlight?.showScreenFrame;

  const isHighlightedMedication = (item) => {
    if (!highlightedMedicationName) {
      return false;
    }
    return String(item?.medicine_name || '').trim().toLowerCase().includes(highlightedMedicationName);
  };

  const renderAppearanceIcon = (shape, color, isLarge = false) => {
    const normalizedShape = String(shape || '').trim().toLowerCase();
    const resolvedColor = getColorValue(color);
    const isTriangle = normalizedShape === 'triangle';
    const isDiamond = normalizedShape === 'diamond';
    const shapeStyle = [
      styles.pillShape,
      isLarge && styles.pillShapeLarge,
      ['round', 'circle'].includes(normalizedShape) && styles.pillShapeRound,
      normalizedShape === 'oval' && styles.pillShapeOval,
      ['capsule', 'oblong'].includes(normalizedShape) && styles.pillShapeCapsule,
      ['tablet', 'square'].includes(normalizedShape) && styles.pillShapeSquare,
      isDiamond && styles.pillShapeDiamond,
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

  const loadMedications = async () => {
    try {
      setIsLoading(true);
      const data = await medicationService.getMyMedications();
      setMedications(data);
    } catch (error) {
      Alert.alert('Load Failed', error?.response?.data?.error || error?.message || 'Could not load medicines.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMedications();
  }, []);

  useEffect(() => {
    if (!highlightedMedicationName || !medications.length || selectedMedication) {
      return;
    }
    const match = medications.find((item) => isHighlightedMedication(item));
    if (match) {
      applyMedicationToForm(match);
    }
  }, [highlightedMedicationName, medications, selectedMedication]);

  useEffect(() => {
    if (!selectedMedication) {
      return;
    }

    const timeoutId = setTimeout(() => {
      scrollRef.current?.scrollToEnd?.({ animated: true });
    }, 80);

    return () => clearTimeout(timeoutId);
  }, [selectedMedication]);

  const filteredMedications = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) {
      return medications;
    }

    return medications.filter((item) => item.medicine_name?.toLowerCase().includes(needle));
  }, [medications, searchText]);

  const groupedMedications = useMemo(() => {
    const groups = TAKE_WITH_OPTIONS.map((slot) => ({
      slot,
      before: [],
      after: [],
    }));

    filteredMedications.forEach((item) => {
      const selectedSlots = parseTakeWith(item.take_with);
      const slotsToShow = selectedSlots.length ? selectedSlots : ['Breakfast'];
      const timingKey = String(item.intake_timing || 'After').toLowerCase().includes('before') ? 'before' : 'after';

      slotsToShow.forEach((slot) => {
        const group = groups.find((entry) => entry.slot === slot);
        if (group) {
          group[timingKey].push(item);
        }
      });
    });

    return groups
      .map((group) => ({
        ...group,
        count: group.before.length + group.after.length,
      }))
      .filter((group) => group.count > 0);
  }, [filteredMedications]);

  const applyMedicationToForm = (medication) => {
    setSelectedMedication(medication);
    setIsEditMode(false);
    setForm({
      medicineName: medication.medicine_name || '',
      selectedColor: medication.selected_color || medication.medicine_color || '',
      selectedShape: medication.selected_shape || medication.medicine_shape || '',
      totalQuantity: String(medication.total_quantity ?? ''),
      dosageMg: String(medication.dosage_mg ?? ''),
      dailyAmount: String(medication.daily_amount ?? ''),
      doseForm: medication.dose_form || 'Tablet',
      takeWithOptions: parseTakeWith(medication.take_with),
      intakeTiming: medication.intake_timing || 'After',
    });
  };

  const handleView = async (item) => {
    // Open details immediately using the list payload so the button always feels responsive.
    applyMedicationToForm(item);

    if (!item?.id) {
      return;
    }

    try {
      const medication = await medicationService.getMedicationById(item.id);
      applyMedicationToForm(medication);
    } catch (error) {
      console.log('[MedicineList] View refresh failed:', error?.response?.data?.error || error?.message || error);
    }
  };

  const toggleTakeWithOption = (option) => {
    if (!isEditMode) {
      return;
    }

    setForm((prev) => {
      const hasOption = prev.takeWithOptions.includes(option);
      if (hasOption) {
        const nextOptions = prev.takeWithOptions.filter((item) => item !== option);
        return {
          ...prev,
          takeWithOptions: nextOptions.length ? nextOptions : prev.takeWithOptions,
        };
      }

      return {
        ...prev,
        takeWithOptions: [...prev.takeWithOptions, option],
      };
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedMedication) {
      return;
    }

    if (
      !form.medicineName.trim() ||
      Number(form.totalQuantity) <= 0 ||
      Number(form.dosageMg) <= 0 ||
      Number(form.dailyAmount) <= 0 ||
      !form.takeWithOptions.length
    ) {
      Alert.alert('Missing Data', 'Please enter valid values for all fields.');
      return;
    }

    try {
      setIsSaving(true);
      const updated = await medicationService.updateMedication(selectedMedication.id, {
        medicineName: form.medicineName.trim(),
        selectedColor: form.selectedColor.trim(),
        selectedShape: form.selectedShape.trim(),
        totalQuantity: Number(form.totalQuantity),
        dosageMg: Number(form.dosageMg),
        dailyAmount: Number(form.dailyAmount),
        doseForm: form.doseForm,
        takeWith: form.takeWithOptions.join(', '),
        intakeTiming: form.intakeTiming,
      });

      try {
        await reminderNotificationService.rescheduleDailyReminders();
      } catch (notificationError) {
        console.log('[MedicineList] Reminder reschedule failed:', notificationError?.message || notificationError);
      }

      setSelectedMedication(updated);
      setMedications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setIsEditMode(false);
      Alert.alert('Updated', 'Medicine details updated successfully.');
    } catch (error) {
      Alert.alert('Update Failed', error?.response?.data?.error || error?.message || 'Could not update medicine.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMedication = () => {
    if (!selectedMedication?.id) {
      return;
    }

    Alert.alert(
      'Delete Medicine',
      `Are you sure you want to delete ${selectedMedication.medicine_name || 'this medicine'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSaving(true);
              await medicationService.deleteMedication(selectedMedication.id);

              try {
                await reminderNotificationService.rescheduleDailyReminders();
              } catch (notificationError) {
                console.log('[MedicineList] Reminder reschedule after delete failed:', notificationError?.message || notificationError);
              }

              setMedications((prev) => prev.filter((item) => item.id !== selectedMedication.id));
              setSelectedMedication(null);
              setIsEditMode(false);
              Alert.alert('Deleted', 'Medicine deleted successfully.');
            } catch (error) {
              Alert.alert('Delete Failed', error?.response?.data?.error || error?.message || 'Could not delete medicine.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.page}>
      <View style={styles.staticHeaderWrap}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>📋 Medicine List</Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { fontSize: 16 * textScale }]}
            placeholder="Search medicine"
            placeholderTextColor="#8d98a3"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={styles.totalMedicineCard}>
          <View>
            <Text style={[styles.totalMedicineLabel, { fontSize: 14 * textScale }]}>Total medicines</Text>
            {!!searchText.trim() && (
              <Text style={[styles.totalMedicineSubText, { fontSize: 12 * textScale }]}>
                {filteredMedications.length} showing now
              </Text>
            )}
          </View>
          <Text style={[styles.totalMedicineValue, { fontSize: 32 * textScale }]}>{medications.length}</Text>
        </View>

      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#2f8fd0" />
          <Text style={[styles.loaderText, { fontSize: 14 * textScale }]}>Loading medicines...</Text>
        </View>
      ) : (
        <View style={styles.listWrap}>
          {groupedMedications.map((group) => (
            <View key={group.slot} style={styles.slotGroupCard}>
              <View style={styles.slotGroupHeader}>
                <Text style={[styles.slotGroupTitle, { fontSize: 18 * textScale }]}>
                  {getSlotIcon(group.slot)} {group.slot}
                </Text>
                <Text style={[styles.slotGroupCount, { fontSize: 14 * textScale }]}>{group.count}</Text>
              </View>

              {[
                { key: 'before', label: 'Before meal', items: group.before },
                { key: 'after', label: 'After meal', items: group.after },
              ].map((timingGroup) =>
                timingGroup.items.length ? (
                  <View key={`${group.slot}-${timingGroup.key}`} style={styles.timingGroupBlock}>
                    <Text style={[styles.timingGroupTitle, { fontSize: 14 * textScale }]}>{timingGroup.label}</Text>

                    {timingGroup.items.map((item) => {
                      const isHighlighted = isHighlightedMedication(item);
                      return (
                      <AgenticGlowCard
                        key={`${group.slot}-${timingGroup.key}-${item.id}`}
                        active={isHighlighted}
                        pulseKey={highlight?.nonce}
                        style={styles.card}
                        highlightStyle={styles.cardHighlighted}
                        borderRadius={22}
                      >
                        <View style={styles.cardRow}>
                          <View style={styles.appearanceBadge}>
                            {renderAppearanceIcon(item.medicine_shape, item.medicine_color)}
                          </View>

                          <View style={styles.cardTextWrap}>
                            <Text style={[styles.medicineName, { fontSize: 18 * textScale }]}>{item.medicine_name}</Text>
                            <Text style={[styles.metaText, { fontSize: 14 * textScale, lineHeight: 20 * textScale }]}>
                              {item.dosage_mg}mg - {item.daily_amount} tablet each time
                            </Text>
                            <Text style={[styles.metaTextLight, { fontSize: 13 * textScale, lineHeight: 18 * textScale }]}>
                              Time: {timingGroup.label}
                            </Text>
                            <Text style={[styles.metaTextLight, { fontSize: 13 * textScale, lineHeight: 18 * textScale }]}>
                              Stock: {item.total_quantity} tablets left
                            </Text>
                            <TouchableOpacity style={styles.viewButton} onPress={() => handleView(item)}>
                              <Text style={[styles.viewButtonText, { fontSize: 14 * textScale }]}>View details</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </AgenticGlowCard>
                      );
                    })}
                  </View>
                ) : null
              )}
            </View>
          ))}

          {!filteredMedications.length && <Text style={[styles.emptyText, { fontSize: 15 * textScale }]}>No medicines found.</Text>}
        </View>
      )}
      </ScrollView>

      {selectedMedication && (
        <View style={styles.detailOverlay}>
          <AgenticGlowCard
            active={isHighlightedMedication(selectedMedication)}
            pulseKey={highlight?.nonce}
            style={styles.detailPanel}
            highlightStyle={styles.detailPanelHighlighted}
            borderRadius={24}
          >
            <View style={styles.detailHeaderRow}>
              <Text style={[styles.detailTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>Medicine Details</Text>
              <TouchableOpacity
                style={styles.detailCloseButton}
                onPress={() => {
                  setSelectedMedication(null);
                  setIsEditMode(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close medicine details"
              >
                <Text style={styles.detailCloseText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.detailScrollContent} showsVerticalScrollIndicator={false}>

          <View style={styles.detailAppearanceRow}>
            <View style={styles.detailAppearanceBadge}>
              {renderAppearanceIcon(selectedMedication.medicine_shape, selectedMedication.medicine_color, true)}
            </View>
            <View style={styles.detailAppearanceTextWrap}>
              <Text style={[styles.detailAppearanceLabel, { fontSize: 13 * textScale }]}>Appearance</Text>
              <Text style={[styles.detailAppearanceText, { fontSize: 14 * textScale }]}>
                Color: {selectedMedication.medicine_color || 'N/A'}
              </Text>
              <Text style={[styles.detailAppearanceText, { fontSize: 14 * textScale }]}>
                Shape: {selectedMedication.medicine_shape || 'N/A'}
              </Text>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { fontSize: 14 * textScale }]}>Medicine name</Text>
          <TextInput
            style={[styles.fieldInput, { fontSize: 15 * textScale }]}
            value={form.medicineName}
            onChangeText={(v) => setForm((p) => ({ ...p, medicineName: v }))}
            editable={isEditMode}
          />

          <Text style={[styles.fieldLabel, { fontSize: 14 * textScale }]}>Color</Text>
          <TextInput
            style={[styles.fieldInput, { fontSize: 15 * textScale }]}
            value={form.selectedColor}
            onChangeText={(v) => setForm((p) => ({ ...p, selectedColor: v }))}
            editable={isEditMode}
          />

          <Text style={[styles.fieldLabel, { fontSize: 14 * textScale }]}>Shape</Text>
          <TextInput
            style={[styles.fieldInput, { fontSize: 15 * textScale }]}
            value={form.selectedShape}
            onChangeText={(v) => setForm((p) => ({ ...p, selectedShape: v }))}
            editable={isEditMode}
          />

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={[styles.fieldLabel, { fontSize: 14 * textScale }]}>Total tablets</Text>
              <TextInput
                style={[styles.fieldInput, { fontSize: 15 * textScale }]}
                value={form.totalQuantity}
                onChangeText={(v) => setForm((p) => ({ ...p, totalQuantity: v }))}
                editable={isEditMode}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.fieldCol}>
              <Text style={[styles.fieldLabel, { fontSize: 14 * textScale }]}>Strength mg</Text>
              <TextInput
                style={[styles.fieldInput, { fontSize: 15 * textScale }]}
                value={form.dosageMg}
                onChangeText={(v) => setForm((p) => ({ ...p, dosageMg: v }))}
                editable={isEditMode}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={[styles.fieldLabel, { fontSize: 14 * textScale }]}>Tablets each time</Text>
              <TextInput
                style={[styles.fieldInput, { fontSize: 15 * textScale }]}
                value={form.dailyAmount}
                onChangeText={(v) => setForm((p) => ({ ...p, dailyAmount: v }))}
                editable={isEditMode}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.fieldCol} />
          </View>

          <View style={styles.scheduleCard}>
            <Text style={[styles.scheduleTitle, { fontSize: 20 * textScale }]}>How to take</Text>

            <Text style={[styles.sectionCaption, { fontSize: 12 * textScale }]}>Medicine type</Text>
            <View style={styles.chipRow}>
              {DOSE_FORM_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.chipButton,
                    form.doseForm === option && styles.chipButtonActive,
                    !isEditMode && styles.chipButtonDisabled,
                  ]}
                  onPress={() => isEditMode && setForm((p) => ({ ...p, doseForm: option }))}
                  disabled={!isEditMode}
                >
                  <Text style={[styles.chipButtonText, form.doseForm === option && styles.chipButtonTextActive, { fontSize: 14 * textScale }]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionCaption, styles.takeWithLabel, { fontSize: 12 * textScale }]}>Take with</Text>
            <View style={styles.mealGrid}>
              {TAKE_WITH_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.mealButton,
                    form.takeWithOptions.includes(option) && styles.mealButtonActive,
                    !isEditMode && styles.chipButtonDisabled,
                  ]}
                  onPress={() => toggleTakeWithOption(option)}
                  disabled={!isEditMode}
                >
                  <Text
                    style={[
                      styles.mealButtonText,
                      form.takeWithOptions.includes(option) && styles.mealButtonTextActive,
                      { fontSize: 12 * textScale },
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.howSection}>
            <Text style={[styles.howSectionTitle, { fontSize: 18 * textScale }]}>Meal time</Text>
            <View style={styles.howButtonsRow}>
              {TIMING_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.howButton,
                    form.intakeTiming === option && styles.howButtonActive,
                    !isEditMode && styles.chipButtonDisabled,
                  ]}
                  onPress={() => isEditMode && setForm((p) => ({ ...p, intakeTiming: option }))}
                  disabled={!isEditMode}
                >
                  <Text style={[styles.howButtonText, form.intakeTiming === option && styles.howButtonTextActive, { fontSize: 15 * textScale }]}>
                    {option === 'Before' ? 'Before meal' : 'After meal'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.safetyCard}>
            <Text style={[styles.safetyTitle, { fontSize: 16 * textScale }]}>Safety Verification</Text>
            <Text style={[styles.safetyBody, { fontSize: 13 * textScale }]}>
              Reminder follows your routine time.
            </Text>
          </View>

          {!isEditMode ? (
            <TouchableOpacity style={styles.editButton} onPress={() => setIsEditMode(true)}>
              <Text style={[styles.editButtonText, { fontSize: 15 * textScale }]}>✎ Edit details</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editActionRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditMode(false)}>
                <Text style={[styles.cancelButtonText, { fontSize: 15 * textScale }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit} disabled={isSaving}>
                <Text style={[styles.saveButtonText, { fontSize: 15 * textScale }]}>{isSaving ? 'Saving...' : '✓ Save'}</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.deleteButton, isSaving && styles.chipButtonDisabled]}
            onPress={handleDeleteMedication}
            disabled={isSaving}
          >
            <Text style={[styles.deleteButtonText, { fontSize: 15 * textScale }]}>{isSaving ? 'Please wait...' : 'Delete Medicine'}</Text>
          </TouchableOpacity>
            </ScrollView>
          </AgenticGlowCard>
        </View>
      )}
      <AgenticScreenFrame active={hasAgenticFrame} pulseKey={highlight?.nonce} />
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#f7efe4',
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
  headerSpacer: {
    width: 46,
    height: 46,
  },
  searchBox: {
    minHeight: 56,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    borderRadius: 18,
    paddingHorizontal: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 52,
    color: '#24352f',
    fontWeight: '800',
    paddingVertical: 0,
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  loaderText: {
    marginTop: 8,
    color: '#58708a',
  },
  listWrap: {
    marginBottom: 14,
  },
  totalMedicineCard: {
    minHeight: 78,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#f4cf75',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  totalMedicineLabel: {
    color: '#5d5045',
    fontWeight: '900',
  },
  totalMedicineSubText: {
    marginTop: 4,
    color: '#74665b',
    fontWeight: '700',
  },
  totalMedicineValue: {
    minWidth: 60,
    color: '#2f5d50',
    fontWeight: '900',
    textAlign: 'right',
  },
  slotGroupCard: {
    backgroundColor: '#eaf4ff',
    borderWidth: 2,
    borderColor: '#b9d4f2',
    borderRadius: 24,
    padding: 12,
    marginBottom: 16,
  },
  slotGroupHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  slotGroupTitle: {
    flex: 1,
    color: '#24352f',
    fontWeight: '900',
    paddingRight: 10,
  },
  slotGroupCount: {
    minWidth: 40,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#2f5d50',
    color: '#ffffff',
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  timingGroupBlock: {
    marginTop: 8,
  },
  timingGroupTitle: {
    alignSelf: 'flex-start',
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    borderRadius: 999,
    color: '#2f5d50',
    fontWeight: '900',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cardHighlighted: {
    borderColor: '#22D3EE',
    backgroundColor: '#eef8ff',
    shadowColor: '#0891B2',
    shadowOpacity: 0.18,
    elevation: 5,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  appearanceBadge: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
  },
  appearanceIconFrame: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#f7efe4',
    borderWidth: 1,
    borderColor: '#d8c9b7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appearanceIconFrameLarge: {
    width: 50,
    height: 50,
    borderRadius: 17,
  },
  pillShape: {
    width: 34,
    height: 24,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(36,53,47,0.22)',
  },
  pillShapeLarge: {
    width: 38,
    height: 28,
  },
  pillShapeRound: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  pillShapeOval: {
    width: 38,
    height: 28,
    borderRadius: 18,
  },
  pillShapeCapsule: {
    width: 40,
    height: 22,
    borderRadius: 14,
  },
  pillShapeSquare: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  pillShapeDiamond: {
    width: 30,
    height: 30,
    borderRadius: 6,
    transform: [{ rotate: '45deg' }],
  },
  pillShapeTriangle: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    textShadowColor: 'rgba(36,53,47,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  pillShapeTriangleLarge: {
    fontSize: 38,
    lineHeight: 42,
  },
  cardTextWrap: {
    flex: 1,
  },
  medicineName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#24352f',
  },
  metaText: {
    marginTop: 4,
    color: '#5d5045',
    fontSize: 13,
    fontWeight: '800',
  },
  metaTextLight: {
    marginTop: 3,
    color: '#74665b',
    fontSize: 12,
    fontWeight: '700',
  },
  viewButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#2f5d50',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#2f5d50',
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  viewButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  emptyText: {
    textAlign: 'center',
    color: '#70869a',
    paddingVertical: 18,
  },
  detailPanel: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#fffdf8',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#f4cf75',
    padding: 14,
  },
  detailPanelHighlighted: {
    borderColor: '#22D3EE',
    shadowColor: '#0891B2',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  detailOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(31, 44, 39, 0.58)',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 24,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailCloseButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff0f2',
    borderWidth: 2,
    borderColor: '#edbdc4',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  detailCloseText: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: '#9b3d47',
    marginTop: -2,
  },
  detailScrollContent: {
    paddingBottom: 4,
  },
  detailTitle: {
    flex: 1,
    fontSize: 18,
    color: '#2d241d',
    fontWeight: '900',
  },
  detailAppearanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#a8dbc8',
    borderRadius: 20,
    backgroundColor: '#e9f7f1',
    padding: 12,
  },
  detailAppearanceBadge: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#fffdf8',
    marginRight: 12,
  },
  detailAppearanceTextWrap: {
    flex: 1,
  },
  detailAppearanceLabel: {
    fontSize: 12,
    color: '#5f7489',
    fontWeight: '700',
    marginBottom: 2,
  },
  detailAppearanceText: {
    fontSize: 13,
    color: '#2e4256',
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    color: '#5d5045',
    fontWeight: '900',
    marginBottom: 6,
  },
  fieldInput: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 12,
    marginBottom: 12,
    color: '#24352f',
    fontWeight: '800',
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fieldCol: {
    width: '48.5%',
  },
  scheduleCard: {
    marginTop: 2,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    padding: 14,
    marginBottom: 12,
  },
  scheduleTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#203447',
    marginBottom: 6,
  },
  sectionCaption: {
    fontSize: 11,
    color: '#63788e',
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  chipRow: {
    flexDirection: 'row',
    marginBottom: 8,
    columnGap: 8,
  },
  chipButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  chipButtonActive: {
    backgroundColor: '#2f5d50',
    borderColor: '#2f5d50',
  },
  chipButtonDisabled: {
    opacity: 0.7,
  },
  chipButtonText: {
    color: '#557089',
    fontWeight: '700',
    fontSize: 12,
  },
  chipButtonTextActive: {
    color: '#ffffff',
  },
  takeWithLabel: {
    marginTop: 2,
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
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  mealButtonActive: {
    borderColor: '#2f5d50',
    backgroundColor: '#e9f7f1',
  },
  mealButtonText: {
    fontSize: 11,
    color: '#637b90',
    fontWeight: '700',
  },
  mealButtonTextActive: {
    color: '#2f5d50',
  },
  howSection: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    padding: 14,
    marginBottom: 12,
  },
  howSectionTitle: {
    fontSize: 14,
    color: '#22384b',
    fontWeight: '900',
    marginBottom: 8,
  },
  howButtonsRow: {
    flexDirection: 'row',
    columnGap: 8,
  },
  howButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#eadcca',
    backgroundColor: '#fffdf8',
    paddingVertical: 12,
    alignItems: 'center',
  },
  howButtonActive: {
    borderColor: '#2f5d50',
    backgroundColor: '#2f5d50',
  },
  howButtonText: {
    color: '#5d7489',
    fontWeight: '700',
    fontSize: 13,
  },
  howButtonTextActive: {
    color: '#ffffff',
  },
  safetyCard: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#b9d4f2',
    backgroundColor: '#eaf4ff',
    padding: 12,
    marginBottom: 12,
  },
  safetyTitle: {
    fontSize: 13,
    color: '#2b4054',
    fontWeight: '700',
    marginBottom: 4,
  },
  safetyBody: {
    fontSize: 12,
    color: '#627a8f',
    lineHeight: 18,
  },
  editButton: {
    marginTop: 4,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  editActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cancelButton: {
    width: '48.5%',
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#fffdf8',
    borderWidth: 2,
    borderColor: '#eadcca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#4d6074',
    fontWeight: '700',
  },
  saveButton: {
    width: '48.5%',
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#2f5d50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  deleteButton: {
    marginTop: 10,
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#f3c0c0',
    backgroundColor: '#fff5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#c0392b',
    fontWeight: '700',
  },
});

export default MedicineListScreen;
