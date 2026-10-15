import React, { useMemo } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const QuickCareScreen = ({
  user,
  onBack,
  onOpenSummary,
  onOpenAssistant,
  onOpenDiabetesPrediction,
  onOpenStrokePrediction,
  onOpenHypertensionPrediction,
}) => {
  const isCaregiver = String(user?.role || '').toLowerCase() === 'caregiver';
  const subjectCopy = isCaregiver ? "the elder's" : 'your';
  const summaryPrompt = isCaregiver
    ? "Give me a short risk prediction summary for my elder. Include diabetes, stroke, and blood pressure risk if data is available, then tell me what needs attention first."
    : "Give me a short risk prediction summary for me. Include diabetes, stroke, and blood pressure risk if data is available, then tell me what needs attention first.";

  const checks = useMemo(() => ([
    {
      id: 'diabetes',
      title: 'Diabetes Risk Check',
      subtitle: `Check ${subjectCopy} possible diabetes risk using saved health values.`,
      icon: '\u{1FA7A}',
      accent: '#2f6654',
      soft: '#e3f8ee',
      border: '#b8ead6',
      onPress: onOpenDiabetesPrediction,
    },
    {
      id: 'stroke',
      title: 'Stroke Risk Check',
      subtitle: `Check ${subjectCopy} possible stroke risk using BP, glucose, BMI, and history.`,
      icon: '\u{1F9E0}',
      accent: '#2576a6',
      soft: '#eaf7ff',
      border: '#cae3f2',
      onPress: onOpenStrokePrediction,
    },
    {
      id: 'hypertension',
      title: 'Blood Pressure Risk Check',
      subtitle: `Check ${subjectCopy} possible hypertension risk using BP, BMI, glucose, and lifestyle.`,
      icon: '\u2665',
      accent: '#a93447',
      soft: '#fff1f4',
      border: '#efccd3',
      onPress: onOpenHypertensionPrediction,
    },
  ]), [
    onOpenDiabetesPrediction,
    onOpenHypertensionPrediction,
    onOpenStrokePrediction,
    subjectCopy,
  ]);

  const handleOpenRiskSummary = () => {
    if (typeof onOpenAssistant === 'function') {
      onOpenAssistant({ initialPrompt: summaryPrompt });
      return;
    }

    onOpenSummary?.();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backButtonText}>{'\u2190'}  Back</Text>
          </Pressable>
        ) : null}

        {typeof onOpenSummary === 'function' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open health summary"
            onPress={onOpenSummary}
            style={({ pressed }) => [styles.summaryPill, pressed && styles.pressed]}
          >
            <Text style={styles.summaryPillText}>Summary</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIconWrap}>
          <Text style={styles.heroIcon}>{'\u{1F49A}'}</Text>
        </View>
        <View style={styles.heroTextWrap}>
          <Text style={styles.heroEyebrow}>Quick Care</Text>
          <Text
            style={styles.heroTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            Risk Prediction
          </Text>
          <Text style={styles.heroSubtitle}>
            Summary and checks are grouped here for quick access.
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open risk prediction summary"
        accessibilityHint="Asks the assistant for a short risk prediction summary"
        onPress={handleOpenRiskSummary}
        style={({ pressed }) => [styles.summaryCard, pressed && styles.cardPressed]}
      >
        <View style={styles.summaryIconWrap}>
          <Text style={styles.summaryIcon}>{'\u{1F4CB}'}</Text>
        </View>
        <View style={styles.cardTextWrap}>
          <Text style={styles.summaryTitle}>Risk Prediction Summary</Text>
          <Text style={styles.summarySubtitle}>
            Get a simple recap of risk results and what to look at first.
          </Text>
        </View>
        <Text style={styles.summaryArrow}>{'\u203A'}</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Risk Prediction Checks</Text>
        <Text style={styles.sectionSubtitle}>Choose one check to review or update.</Text>
      </View>

      {checks.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          accessibilityHint={item.subtitle}
          disabled={typeof item.onPress !== 'function'}
          onPress={item.onPress}
          style={({ pressed }) => [
            styles.checkCard,
            { backgroundColor: item.soft, borderColor: item.border },
            pressed && styles.cardPressed,
          ]}
        >
          <View style={[styles.checkIconWrap, { backgroundColor: item.accent }]}>
            <Text style={styles.checkIcon}>{item.icon}</Text>
          </View>
          <View style={styles.cardTextWrap}>
            <Text
              style={styles.checkTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {item.title}
            </Text>
            <Text style={styles.checkSubtitle} numberOfLines={2}>
              {item.subtitle}
            </Text>
          </View>
          <Text style={[styles.checkArrow, { color: item.accent }]}>{'\u203A'}</Text>
        </Pressable>
      ))}

      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerIcon}>{'\u2139\uFE0F'}</Text>
        <Text style={styles.disclaimerText}>
          These checks are for health awareness only. They do not replace medical advice.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7efe4',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'android' ? 30 : 24,
    paddingBottom: 132,
  },
  topBar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backButton: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#eadfcd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#2f6654',
    fontSize: 17,
    fontWeight: '900',
  },
  summaryPill: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#eaf7ff',
    borderWidth: 1,
    borderColor: '#cae3f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryPillText: {
    color: '#2576a6',
    fontSize: 15,
    fontWeight: '900',
  },
  hero: {
    minHeight: 154,
    borderRadius: 24,
    backgroundColor: '#2f6654',
    borderWidth: 2,
    borderColor: '#e5c44f',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#725e25',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#fff4b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroIcon: {
    fontSize: 32,
    lineHeight: 38,
  },
  heroTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    color: '#fff4b8',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#ecfff6',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
    marginTop: 5,
  },
  summaryCard: {
    minHeight: 116,
    borderRadius: 20,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#eadfcd',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#7a674f',
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  summaryIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: '#5b3ca4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  summaryIcon: {
    fontSize: 27,
    lineHeight: 32,
  },
  cardTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  summaryTitle: {
    color: '#18352f',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
  },
  summarySubtitle: {
    color: '#5e5143',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 4,
  },
  summaryArrow: {
    color: '#5b3ca4',
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#27231f',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: '#5e5143',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 2,
  },
  checkCard: {
    minHeight: 106,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#7a674f',
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  checkIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  checkIcon: {
    color: '#ffffff',
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
  },
  checkTitle: {
    color: '#18352f',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  checkSubtitle: {
    color: '#3d3833',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  checkArrow: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#fff7db',
    borderLeftWidth: 4,
    borderLeftColor: '#e5c44f',
  },
  disclaimerIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  disclaimerText: {
    flex: 1,
    color: '#5e5143',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.68,
  },
  cardPressed: {
    opacity: 0.84,
  },
});

export default QuickCareScreen;
