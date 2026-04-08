import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { receiptOcrService } from '../services/receiptOcrService';
import { medicationService } from '../services/medicationService';

const ReceiptScanScreen = ({ onBack, onDetected, onDetectedMany, initialDetectedMedicines, onCapturedListChange }) => {
  const [imageUri, setImageUri] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawTextPreview, setRawTextPreview] = useState('');
  const [detectedMedicines, setDetectedMedicines] = useState([]);
  const [savingByIndex, setSavingByIndex] = useState({});

  useEffect(() => {
    if (!Array.isArray(initialDetectedMedicines) || !initialDetectedMedicines.length) {
      return;
    }

    setDetectedMedicines((prev) => (prev.length ? prev : initialDetectedMedicines));
  }, [initialDetectedMedicines]);

  useEffect(() => {
    onCapturedListChange?.(detectedMedicines);
  }, [detectedMedicines, onCapturedListChange]);

  const normalizeName = (value) => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const resolveMatchedMedicines = async (ocrMedicines) => {
    const list = Array.isArray(ocrMedicines) ? ocrMedicines : [];
    if (!list.length) {
      return [];
    }

    const resolved = await Promise.all(
      list.map(async (item) => {
        const rawName = String(item?.medicineName || '').replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!rawName) {
          return null;
        }

        try {
          const suggestions = await medicationService.getSuggestions(rawName);
          const normalizedRaw = normalizeName(rawName);

          const exact = (suggestions || []).find((entry) => normalizeName(entry?.name) === normalizedRaw);
          const startsWith = (suggestions || []).find((entry) => normalizeName(entry?.name).startsWith(normalizedRaw));
          const contains = (suggestions || []).find((entry) => normalizeName(entry?.name).includes(normalizedRaw));
          const matched = exact || startsWith || contains;

          if (!matched?.name) {
            return null;
          }

          return {
            medicineName: String(matched.name).replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim(),
            dosageMg: String(item?.dosageMg || '20').replace(/[^0-9.]/g, ''),
            totalQuantity: String(item?.totalQuantity || '30').replace(/[^0-9]/g, ''),
            dailyAmount: String(item?.dailyAmount || '1').replace(/[^0-9]/g, ''),
            saved: false,
          };
        } catch (error) {
          return null;
        }
      })
    );

    const unique = [];
    const seen = new Set();
    for (const item of resolved) {
      if (!item?.medicineName) {
        continue;
      }

      const key = `${normalizeName(item.medicineName)}|${item.dosageMg}|${item.totalQuantity}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(item);
    }

    return unique;
  };

  const runOcrForUri = async (uri) => {
    try {
      setIsProcessing(true);
      setImageUri(uri);
      const result = await receiptOcrService.parseReceiptImage(uri);
      setRawTextPreview(result?.rawText || '');
      const list = Array.isArray(result?.medicines) ? result.medicines : [];

      if (list.length) {
        const matched = await resolveMatchedMedicines(list);
        if (!matched.length) {
          Alert.alert('No Match Found', 'Captured names did not match medicine data in database.');
          setDetectedMedicines([]);
          return;
        }

        setDetectedMedicines(matched);
      } else {
        const detected = result?.fields || {};
        const fallback = {
          medicineName: String(detected.medicineName || '').replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim(),
          dosageMg: String(detected.dosageMg || '20').replace(/[^0-9.]/g, ''),
          totalQuantity: String(detected.totalQuantity || '30').replace(/[^0-9]/g, ''),
          dailyAmount: String(detected.dailyAmount || '1').replace(/[^0-9]/g, ''),
          saved: false,
        };

        const matchedFallback = await resolveMatchedMedicines([fallback]);
        if (!matchedFallback.length) {
          Alert.alert('No Match Found', 'Captured name did not match medicine data in database.');
          setDetectedMedicines([]);
          return;
        }

        setDetectedMedicines(matchedFallback);
      }
    } catch (error) {
      Alert.alert('OCR Failed', error?.message || 'Could not read medicine details from receipt image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateDetectedMedicineField = (index, field, value) => {
    setDetectedMedicines((prev) => prev.map((item, i) => {
      if (i !== index) {
        return item;
      }

      if (field === 'medicineName') {
        return {
          ...item,
          medicineName: String(value || '').replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trimStart(),
          saved: false,
        };
      }

      if (field === 'dosageMg') {
        return {
          ...item,
          dosageMg: String(value || '').replace(/[^0-9.]/g, ''),
          saved: false,
        };
      }

      return {
        ...item,
        totalQuantity: String(value || '').replace(/[^0-9]/g, ''),
        saved: false,
      };
    }));
  };

  const handleSaveSingleMedicine = async (item, index) => {
    const medicineName = String(item?.medicineName || '').trim();
    const dosageMg = Number(item?.dosageMg);
    const totalQuantity = Number(item?.totalQuantity);

    if (!medicineName || !/^[a-zA-Z\s]+$/.test(medicineName)) {
      Alert.alert('Invalid Name', 'Medicine name should contain only letters.');
      return;
    }

    if (!Number.isFinite(dosageMg) || dosageMg <= 0) {
      Alert.alert('Invalid Dose', 'Dose should include a valid mg value.');
      return;
    }

    if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
      Alert.alert('Invalid Quantity', 'Quantity should be a positive number.');
      return;
    }

    try {
      setSavingByIndex((prev) => ({ ...prev, [index]: true }));

      let selectedColor = '';
      let selectedShape = '';
      try {
        const appearances = await medicationService.getAppearancesForMedicineName(medicineName);
        if (Array.isArray(appearances) && appearances.length > 0) {
          selectedColor = String(appearances[0]?.color || '').trim();
          selectedShape = String(appearances[0]?.shape || '').trim();
        }
      } catch (appearanceError) {
        // Keep empty appearance fields if appearance lookup fails.
      }

      await medicationService.saveMedication({
        medicineName,
        selectedColor,
        selectedShape,
        totalQuantity,
        dosageMg,
        dailyAmount: Math.max(1, Number(item?.dailyAmount) || 1),
        doseForm: 'Tablet',
        takeWith: 'Breakfast',
        intakeTiming: 'After',
      });

      setDetectedMedicines((prev) => prev.filter((_, i) => i !== index));
      setSavingByIndex({});
      Alert.alert('Saved', `${medicineName} saved and removed from captured list.`);
    } catch (error) {
      Alert.alert('Save Failed', error?.response?.data?.error || error?.message || 'Could not save medicine.');
    } finally {
      setSavingByIndex((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to scan a receipt.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      await runOcrForUri(result.assets[0].uri);
    } catch (error) {
      Alert.alert('Camera Error', error?.message || 'Could not open camera.');
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Photo library permission is needed to scan a receipt.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      await runOcrForUri(result.assets[0].uri);
    } catch (error) {
      Alert.alert('Gallery Error', error?.message || 'Could not open gallery.');
    }
  };

  const handleDeleteCapturedMedicine = (index) => {
    setDetectedMedicines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearCapturedData = () => {
    setDetectedMedicines([]);
    setRawTextPreview('');
    setImageUri('');
    setSavingByIndex({});
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Scan Pharmacy Receipt</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.subtitle}>Take a clear photo of the receipt. OCR will auto-fill medicine details.</Text>

      {!!detectedMedicines.length && (
        <View style={styles.detectedListCard}>
          <Text style={styles.detectedListTitle}>Detected Medicines ({detectedMedicines.length})</Text>
          <Text style={styles.detectedListSubtitle}>Edit each row and save separately.</Text>
          <TouchableOpacity
            style={styles.fillAllButton}
            onPress={() => onDetectedMany?.(detectedMedicines.map((item) => ({
              medicineName: item.medicineName || '',
              dosageMg: item.dosageMg || '20',
              totalQuantity: item.totalQuantity || '30',
              dailyAmount: item.dailyAmount || '1',
            })))}
          >
            <Text style={styles.fillAllButtonText}>Fill All One by One</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clearCapturedButton}
            onPress={handleClearCapturedData}
          >
            <Text style={styles.clearCapturedButtonText}>Clear Captured Data</Text>
          </TouchableOpacity>

          {detectedMedicines.map((item, index) => (
            <View key={`${item.medicineName || 'medicine'}-${index}`} style={styles.detectedItemCard}>
              <Text style={styles.detectedLabel}>Name (letters only)</Text>
              <TextInput
                value={item.medicineName}
                onChangeText={(value) => updateDetectedMedicineField(index, 'medicineName', value)}
                style={styles.detectedInput}
                placeholder="Medicine name"
                placeholderTextColor="#8292a2"
              />

              <View style={styles.detectedInputRow}>
                <View style={styles.detectedInputCol}>
                  <Text style={styles.detectedLabel}>Dose (mg)</Text>
                  <TextInput
                    value={item.dosageMg}
                    onChangeText={(value) => updateDetectedMedicineField(index, 'dosageMg', value)}
                    style={styles.detectedInput}
                    placeholder="20"
                    keyboardType="decimal-pad"
                    placeholderTextColor="#8292a2"
                  />
                </View>
                <View style={styles.detectedInputCol}>
                  <Text style={styles.detectedLabel}>Qty</Text>
                  <TextInput
                    value={item.totalQuantity}
                    onChangeText={(value) => updateDetectedMedicineField(index, 'totalQuantity', value)}
                    style={styles.detectedInput}
                    placeholder="30"
                    keyboardType="number-pad"
                    placeholderTextColor="#8292a2"
                  />
                </View>
              </View>

              <View style={styles.detectedActionsRow}>
                <TouchableOpacity
                  style={styles.useEntryButton}
                  onPress={() => onDetected?.({
                    medicineName: item.medicineName || '',
                    dosageMg: item.dosageMg || '20',
                    totalQuantity: item.totalQuantity || '30',
                    dailyAmount: item.dailyAmount || '1',
                  })}
                >
                  <Text style={styles.useEntryButtonText}>Open in Entry Form</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteEntryButton}
                  onPress={() => handleDeleteCapturedMedicine(index)}
                >
                  <Text style={styles.deleteEntryButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleTakePhoto} disabled={isProcessing}>
          <Text style={styles.primaryButtonText}>Capture Receipt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handlePickFromGallery} disabled={isProcessing}>
          <Text style={styles.secondaryButtonText}>Pick from Gallery</Text>
        </TouchableOpacity>
      </View>

      {isProcessing && (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color="#2e8ec8" />
          <Text style={styles.loadingText}>Reading receipt text and extracting fields...</Text>
        </View>
      )}

      {!!imageUri && (
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Receipt Preview</Text>
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        </View>
      )}

      {!!rawTextPreview && (
        <View style={styles.rawTextCard}>
          <Text style={styles.rawTextTitle}>Detected Text</Text>
          <Text style={styles.rawTextBody}>{rawTextPreview}</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 14,
    paddingBottom: 26,
    backgroundColor: '#f4f6f8',
    flexGrow: 1,
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
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 18,
    color: '#34414d',
    fontWeight: '700',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#23303c',
  },
  headerSpacer: {
    width: 34,
    height: 34,
  },
  subtitle: {
    color: '#5e6f7f',
    fontSize: 13,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  primaryButton: {
    flex: 1,
    marginRight: 6,
    backgroundColor: '#2e8ec8',
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  secondaryButton: {
    flex: 1,
    marginLeft: 6,
    borderColor: '#2e8ec8',
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f9fd',
  },
  secondaryButtonText: {
    color: '#2e6f9a',
    fontWeight: '700',
    fontSize: 12,
  },
  loadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dce7ef',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  loadingText: {
    marginLeft: 8,
    color: '#546576',
    fontSize: 12,
  },
  previewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e8ef',
    padding: 10,
    marginBottom: 12,
  },
  previewTitle: {
    color: '#2b3c49',
    fontWeight: '700',
    marginBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: 280,
    borderRadius: 8,
    backgroundColor: '#ecf1f5',
  },
  rawTextCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e8ef',
    padding: 10,
  },
  rawTextTitle: {
    color: '#2b3c49',
    fontWeight: '700',
    marginBottom: 6,
  },
  rawTextBody: {
    color: '#4f6172',
    fontSize: 12,
    lineHeight: 18,
  },
  detectedListCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9e6f0',
    padding: 10,
    marginBottom: 12,
  },
  detectedListTitle: {
    color: '#1f3241',
    fontSize: 15,
    fontWeight: '700',
  },
  detectedListSubtitle: {
    color: '#607384',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  fillAllButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f6f9d',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  fillAllButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  clearCapturedButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#6f7f8e',
    backgroundColor: '#f4f7fa',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  clearCapturedButtonText: {
    color: '#4f6071',
    fontSize: 12,
    fontWeight: '700',
  },
  detectedItemCard: {
    borderWidth: 1,
    borderColor: '#e1e9f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#f9fcff',
  },
  detectedName: {
    color: '#263845',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  detectedLabel: {
    color: '#4e6377',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  detectedInput: {
    borderWidth: 1,
    borderColor: '#d8e4ee',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    minHeight: 36,
    paddingHorizontal: 10,
    color: '#243847',
    fontSize: 13,
    marginBottom: 8,
  },
  detectedInputRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  detectedInputCol: {
    flex: 1,
  },
  detectedActionsRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  detectedMeta: {
    color: '#596d7f',
    fontSize: 12,
    marginBottom: 2,
  },
  useEntryButton: {
    marginTop: 8,
    flex: 1,
    backgroundColor: '#2e8ec8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 6,
    alignItems: 'center',
  },
  useEntryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteEntryButton: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cc415b',
    backgroundColor: '#fff0f3',
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  deleteEntryButtonText: {
    color: '#b33a52',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default ReceiptScanScreen;
