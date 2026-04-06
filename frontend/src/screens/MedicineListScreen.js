import React, { useEffect, useMemo, useState } from 'react';
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
  purple: '#9b59b6',
  pink: '#ff6ea8',
  white: '#ecf0f1',
  black: '#2d3436',
  brown: '#8e6e53',
  gray: '#95a5a6',
  grey: '#95a5a6',
};

const getShapeIcon = (shape) => {
  const normalized = (shape || '').toString().trim().toLowerCase();
  return shapeIconMap[normalized] || '⬤';
};

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

const MedicineListScreen = ({ onBack }) => {
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
    takeWith: 'Breakfast',
    intakeTiming: 'After',
  });

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

  const filteredMedications = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) {
      return medications;
    }

    return medications.filter((item) => item.medicine_name?.toLowerCase().includes(needle));
  }, [medications, searchText]);

  const handleView = async (id) => {
    try {
      const medication = await medicationService.getMedicationById(id);
      setSelectedMedication(medication);
      setIsEditMode(false);
      setForm({
        medicineName: medication.medicine_name,
        selectedColor: medication.selected_color || medication.medicine_color || '',
        selectedShape: medication.selected_shape || medication.medicine_shape || '',
        totalQuantity: String(medication.total_quantity),
        dosageMg: String(medication.dosage_mg),
        dailyAmount: String(medication.daily_amount),
        doseForm: medication.dose_form,
        takeWith: medication.take_with,
        intakeTiming: medication.intake_timing,
      });
    } catch (error) {
      Alert.alert('View Failed', error?.response?.data?.error || error?.message || 'Could not load medicine details.');
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedMedication) {
      return;
    }

    if (
      !form.medicineName.trim() ||
      Number(form.totalQuantity) <= 0 ||
      Number(form.dosageMg) <= 0 ||
      Number(form.dailyAmount) <= 0
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
        takeWith: form.takeWith,
        intakeTiming: form.intakeTiming,
      });

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

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Medicine List</Text>
        <View style={styles.headerSpacer} />
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search medicine name..."
        value={searchText}
        onChangeText={setSearchText}
      />

      {isLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#2f8fd0" />
          <Text style={styles.loaderText}>Loading medicines...</Text>
        </View>
      ) : (
        <View style={styles.listWrap}>
          {filteredMedications.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardRow}>
                <View style={[styles.appearanceBadge, { backgroundColor: getColorValue(item.medicine_color) }]}>
                  <Text style={styles.appearanceBadgeIcon}>{getShapeIcon(item.medicine_shape)}</Text>
                </View>

                <View style={styles.cardTextWrap}>
                  <Text style={styles.medicineName}>{item.medicine_name}</Text>
                  <Text style={styles.metaText}>
                    {item.take_with} - {item.dosage_mg}mg ({item.daily_amount} tab)
                  </Text>
                  <Text style={styles.metaTextLight}>{item.total_quantity} tabs left</Text>
                  <Text style={styles.metaTextLight}>
                    {item.medicine_color || 'No color'} | {item.medicine_shape || 'No shape'}
                  </Text>
                  <TouchableOpacity style={styles.viewButton} onPress={() => handleView(item.id)}>
                    <Text style={styles.viewButtonText}>View</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}

          {!filteredMedications.length && <Text style={styles.emptyText}>No medicines found.</Text>}
        </View>
      )}

      {selectedMedication && (
        <View style={styles.detailPanel}>
          <Text style={styles.detailTitle}>Medicine Details</Text>

          <View style={styles.detailAppearanceRow}>
            <View style={[styles.detailAppearanceBadge, { backgroundColor: getColorValue(selectedMedication.medicine_color) }]}>
              <Text style={styles.detailAppearanceIcon}>{getShapeIcon(selectedMedication.medicine_shape)}</Text>
            </View>
            <View style={styles.detailAppearanceTextWrap}>
              <Text style={styles.detailAppearanceLabel}>Appearance</Text>
              <Text style={styles.detailAppearanceText}>
                Color: {selectedMedication.medicine_color || 'N/A'}
              </Text>
              <Text style={styles.detailAppearanceText}>
                Shape: {selectedMedication.medicine_shape || 'N/A'}
              </Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Medicine Name</Text>
          <TextInput
            style={styles.fieldInput}
            value={form.medicineName}
            onChangeText={(v) => setForm((p) => ({ ...p, medicineName: v }))}
            editable={isEditMode}
          />

          <Text style={styles.fieldLabel}>Selected Color</Text>
          <TextInput
            style={styles.fieldInput}
            value={form.selectedColor}
            onChangeText={(v) => setForm((p) => ({ ...p, selectedColor: v }))}
            editable={isEditMode}
          />

          <Text style={styles.fieldLabel}>Selected Shape</Text>
          <TextInput
            style={styles.fieldInput}
            value={form.selectedShape}
            onChangeText={(v) => setForm((p) => ({ ...p, selectedShape: v }))}
            editable={isEditMode}
          />

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Total Qty</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.totalQuantity}
                onChangeText={(v) => setForm((p) => ({ ...p, totalQuantity: v }))}
                editable={isEditMode}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Dosage mg</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.dosageMg}
                onChangeText={(v) => setForm((p) => ({ ...p, dosageMg: v }))}
                editable={isEditMode}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Daily Amount</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.dailyAmount}
                onChangeText={(v) => setForm((p) => ({ ...p, dailyAmount: v }))}
                editable={isEditMode}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Dose Form</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.doseForm}
                onChangeText={(v) => setForm((p) => ({ ...p, doseForm: v }))}
                editable={isEditMode}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Take With</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.takeWith}
                onChangeText={(v) => setForm((p) => ({ ...p, takeWith: v }))}
                editable={isEditMode}
              />
            </View>
            <View style={styles.fieldCol}>
              <Text style={styles.fieldLabel}>Timing</Text>
              <TextInput
                style={styles.fieldInput}
                value={form.intakeTiming}
                onChangeText={(v) => setForm((p) => ({ ...p, intakeTiming: v }))}
                editable={isEditMode}
              />
            </View>
          </View>

          {!isEditMode ? (
            <TouchableOpacity style={styles.editButton} onPress={() => setIsEditMode(true)}>
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.editActionRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditMode(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit} disabled={isSaving}>
                <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f7fb',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
    fontSize: 22,
    color: '#202f3b',
    fontWeight: '700',
  },
  headerSpacer: {
    width: 34,
    height: 34,
  },
  searchInput: {
    height: 46,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dce4ec',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
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
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e6ed',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  appearanceBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#d3dde8',
  },
  appearanceBadgeIcon: {
    fontSize: 18,
    color: '#243648',
    fontWeight: '700',
  },
  cardTextWrap: {
    flex: 1,
  },
  medicineName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#25384a',
  },
  metaText: {
    marginTop: 4,
    color: '#4e6680',
    fontSize: 13,
  },
  metaTextLight: {
    marginTop: 2,
    color: '#7d8f9f',
    fontSize: 12,
  },
  viewButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#ebf6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b7ddf7',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewButtonText: {
    color: '#216ea6',
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    color: '#70869a',
    paddingVertical: 18,
  },
  detailPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9e2ec',
    padding: 12,
  },
  detailTitle: {
    fontSize: 18,
    color: '#203447',
    fontWeight: '700',
    marginBottom: 10,
  },
  detailAppearanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dde6ef',
    borderRadius: 12,
    backgroundColor: '#f7fbff',
    padding: 10,
  },
  detailAppearanceBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d3dde8',
    marginRight: 10,
  },
  detailAppearanceIcon: {
    fontSize: 20,
    color: '#243648',
    fontWeight: '700',
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
    color: '#617488',
    fontWeight: '700',
    marginBottom: 4,
  },
  fieldInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d6dee8',
    backgroundColor: '#f9fbfd',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fieldCol: {
    width: '48.5%',
  },
  editButton: {
    marginTop: 4,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2f8fd0',
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
    height: 44,
    borderRadius: 12,
    backgroundColor: '#eef2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#4d6074',
    fontWeight: '700',
  },
  saveButton: {
    width: '48.5%',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2f8fd0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});

export default MedicineListScreen;
