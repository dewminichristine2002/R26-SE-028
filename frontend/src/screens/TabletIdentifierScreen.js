import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { medicationService } from '../services/medicationService';

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

const TabletIdentifierScreen = ({ onBack, reminderTextScale = 1 }) => {
  const [photoUri, setPhotoUri] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const textScale = reminderTextScale || 1;

  const bestMatch = analysis?.match || null;
  const matches = Array.isArray(analysis?.matches) ? analysis.matches : [];
  const closeMatches = bestMatch ? matches.slice(1, 4) : matches.slice(0, 4);
  const isMatched = analysis?.status === 'matched' && bestMatch;

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
