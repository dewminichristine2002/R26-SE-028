import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import HeaderAccountActions from '../components/HeaderAccountActions';
import { receiptOcrService } from '../services/receiptOcrService';
import { medicationService } from '../services/medicationService';

const ReceiptScanScreen = ({ onBack, onDetected, onDetectedMany, initialDetectedMedicines, onCapturedListChange, reminderTextScale = 1 }) => {
  const [imageUri, setImageUri] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [rawTextPreview, setRawTextPreview] = useState('');
  const [detectedMedicines, setDetectedMedicines] = useState([]);
  const [savingByIndex, setSavingByIndex] = useState({});
  const textScale = reminderTextScale || 1;

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
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { fontSize: 19 * textScale }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          🧾 Scan Receipt
        </Text>
        <View style={styles.accountActionsWrap}>
          <HeaderAccountActions />
        </View>
      </View>

      <View style={styles.scanHelpCard}>
        <View style={styles.scanHelpIconWrap}>
          <Text style={styles.scanHelpIcon}>🧾</Text>
        </View>
        <View style={styles.scanHelpTextWrap}>
          <Text style={[styles.scanHelpTitle, { fontSize: 21 * textScale, lineHeight: 27 * textScale }]}>Add from receipt</Text>
          <Text style={[styles.subtitle, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>Take a clear photo.</Text>
        </View>
      </View>

      {!!detectedMedicines.length && (
        <View style={styles.detectedListCard}>
          <Text style={[styles.detectedListTitle, { fontSize: 20 * textScale, lineHeight: 26 * textScale }]}>Found Medicines ({detectedMedicines.length})</Text>
          <Text style={[styles.detectedListSubtitle, { fontSize: 13 * textScale, lineHeight: 18 * textScale }]}>Check details before saving.</Text>
          <View style={styles.detectedButtonsRow}>
            <TouchableOpacity
              style={styles.fillAllButton}
              onPress={() => onDetectedMany?.(detectedMedicines.map((item) => ({
                medicineName: item.medicineName || '',
                dosageMg: item.dosageMg || '20',
                totalQuantity: item.totalQuantity || '30',
                dailyAmount: item.dailyAmount || '1',
              })))}
            >
              <Text style={styles.detectedButtonIcon}>✓</Text>
              <Text style={[styles.fillAllButtonText, { fontSize: 14 * textScale }]}>Use all medicines</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.clearCapturedButton}
              onPress={handleClearCapturedData}
            >
              <Text style={styles.detectedButtonIconDark}>×</Text>
              <Text style={[styles.clearCapturedButtonText, { fontSize: 14 * textScale }]}>Clear list</Text>
            </TouchableOpacity>
          </View>

          {detectedMedicines.map((item, index) => (
            <View key={`${item.medicineName || 'medicine'}-${index}`} style={styles.detectedItemCard}>
              <Text style={[styles.detectedLabel, { fontSize: 12 * textScale }]}>Medicine name</Text>
              <TextInput
                value={item.medicineName}
                onChangeText={(value) => updateDetectedMedicineField(index, 'medicineName', value)}
                style={[styles.detectedInput, { fontSize: 14 * textScale }]}
                placeholder="Medicine name"
                placeholderTextColor="#8292a2"
              />

              <View style={styles.detectedInputRow}>
                <View style={styles.detectedInputCol}>
                  <Text style={[styles.detectedLabel, { fontSize: 12 * textScale }]}>Strength mg</Text>
                  <TextInput
                    value={item.dosageMg}
                    onChangeText={(value) => updateDetectedMedicineField(index, 'dosageMg', value)}
                    style={[styles.detectedInput, { fontSize: 14 * textScale }]}
                    placeholder="20"
                    keyboardType="decimal-pad"
                    placeholderTextColor="#8292a2"
                  />
                </View>
                <View style={styles.detectedInputCol}>
                  <Text style={[styles.detectedLabel, { fontSize: 12 * textScale }]}>Tablets</Text>
                  <TextInput
                    value={item.totalQuantity}
                    onChangeText={(value) => updateDetectedMedicineField(index, 'totalQuantity', value)}
                    style={[styles.detectedInput, { fontSize: 14 * textScale }]}
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
                  <Text style={[styles.useEntryButtonText, { fontSize: 14 * textScale }]}>Use This</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteEntryButton}
                  onPress={() => handleDeleteCapturedMedicine(index)}
                >
                  <Text style={[styles.deleteEntryButtonText, { fontSize: 14 * textScale }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleTakePhoto} disabled={isProcessing}>
          <Text style={styles.actionButtonIcon}>📷</Text>
          <Text style={[styles.primaryButtonText, { fontSize: 16 * textScale }]}>Take Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={handlePickFromGallery} disabled={isProcessing}>
          <Text style={styles.actionButtonIcon}>🖼️</Text>
          <Text style={[styles.secondaryButtonText, { fontSize: 16 * textScale }]}>Gallery</Text>
        </TouchableOpacity>
      </View>

      {isProcessing && (
        <View style={styles.loadingCard}>
          <ActivityIndicator size="small" color="#2e8ec8" />
          <Text style={[styles.loadingText, { fontSize: 14 * textScale }]}>Reading receipt...</Text>
        </View>
      )}

      {!!imageUri && (
        <View style={styles.previewCard}>
          <Text style={[styles.previewTitle, { fontSize: 18 * textScale }]}>Receipt Preview</Text>
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        </View>
      )}

      {!!rawTextPreview && (
        <View style={styles.rawTextCard}>
          <View style={styles.rawTextHeader}>
            <Text style={[styles.rawTextTitle, { fontSize: 18 * textScale }]}>📖 Text from receipt</Text>
            <Text style={styles.rawTextBadge}>Read only</Text>
          </View>
          <Text style={[styles.rawTextHint, { fontSize: 13 * textScale, lineHeight: 18 * textScale }]}>
            Use this to check the scanned words.
          </Text>
          <ScrollView style={styles.rawTextScrollContainer} nestedScrollEnabled={true}>
            <Text style={[styles.rawTextBody, { fontSize: 15 * textScale, lineHeight: 24 * textScale }]}>{rawTextPreview}</Text>
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F5FAF8',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#275C4B',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#F4CF75',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 78,
    marginBottom: 24,
    elevation: 5,
    shadowColor: '#20382F',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  backButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '700',
    color: '#275C4B',
    marginTop: -4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontWeight: '800',
    marginHorizontal: 6,
    flexShrink: 1,
  },
  accountActionsWrap: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanHelpCard: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#DCE9E3',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanHelpIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: '#E5F6EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  scanHelpIcon: {
    fontSize: 28,
  },
  scanHelpTextWrap: {
    flex: 1,
  },
  scanHelpTitle: {
    fontSize: 21,
    lineHeight: 27,
    color: '#193D31',
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 3,
    color: '#63736A',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    marginBottom: 14,
    columnGap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#216B58',
    borderRadius: 18,
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2D806B',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
  },
  secondaryButton: {
    flex: 1,
    borderColor: '#275C4B',
    borderWidth: 2,
    borderRadius: 18,
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#275C4B',
    fontWeight: '900',
    fontSize: 12,
  },
  actionButtonIcon: {
    fontSize: 22,
    marginBottom: 3,
  },
  loadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#DCE9E3',
    padding: 12,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#DCE9E3',
    padding: 12,
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
    borderRadius: 16,
    backgroundColor: '#ecf1f5',
  },
  rawTextCard: {
    backgroundColor: '#F5FAF8',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#b9d4f2',
    padding: 14,
    marginBottom: 14,
    minHeight: 200,
  },
  rawTextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#b9d4f2',
  },
  rawTextTitle: {
    color: '#193D31',
    fontWeight: '900',
    fontSize: 18,
  },
  rawTextBadge: {
    fontSize: 11,
    color: '#275C4B',
    fontWeight: '900',
    backgroundColor: '#e9f7f1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rawTextHint: {
    marginBottom: 10,
    color: '#607384',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  rawTextScrollContainer: {
    maxHeight: 260,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#d6e7f7',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rawTextBody: {
    color: '#193D31',
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0,
  },
  detectedListCard: {
    backgroundColor: '#F5FAF8',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#b9d4f2',
    padding: 12,
    marginBottom: 14,
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
    marginBottom: 10,
  },
  detectedButtonsRow: {
    flexDirection: 'row',
    columnGap: 10,
    marginBottom: 12,
  },
  fillAllButton: {
    flex: 1,
    minHeight: 58,
    backgroundColor: '#216B58',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillAllButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  clearCapturedButton: {
    flex: 1,
    minHeight: 58,
    borderWidth: 2,
    borderColor: '#DCE9E3',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearCapturedButtonText: {
    color: '#4f6071',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  detectedButtonIcon: {
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '900',
  },
  detectedButtonIconDark: {
    color: '#53645A',
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '900',
  },
  detectedItemCard: {
    borderWidth: 2,
    borderColor: '#DCE9E3',
    borderRadius: 20,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
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
    borderWidth: 2,
    borderColor: '#DCE9E3',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    minHeight: 48,
    paddingHorizontal: 12,
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
    backgroundColor: '#216B58',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 11,
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
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#cc415b',
    backgroundColor: '#fff0f3',
    paddingHorizontal: 10,
    paddingVertical: 11,
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
