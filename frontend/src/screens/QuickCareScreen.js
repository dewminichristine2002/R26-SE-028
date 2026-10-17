import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HeaderAccountActions from '../components/HeaderAccountActions';

const checks = [
  { key: 'diabetes', title: 'Diabetes risk', detail: 'Review blood sugar and related factors', icon: 'water-outline', color: '#96591F', tint: '#FFF5EA', border: '#EBD6BE', arrowTint: '#F8E8CE' },
  { key: 'stroke', title: 'Stroke risk', detail: 'Review blood pressure and health history', icon: 'pulse-outline', color: '#2D72A9', tint: '#EDF5FC', border: '#CCDFEC', arrowTint: '#DCECF8' },
  { key: 'hypertension', title: 'Blood pressure risk', detail: 'Review your blood pressure and lifestyle', icon: 'heart-outline', color: '#20745D', tint: '#EAF7F1', border: '#CAE4D6', arrowTint: '#D8EFE4' },
];

export default function QuickCareScreen({ user, onBack, onOpenSummary, onOpenAssistant, onOpenDiabetesPrediction, onOpenStrokePrediction, onOpenHypertensionPrediction }) {
  const isCaregiver = String(user?.role || '').toLowerCase() === 'caregiver';
  const prompt = isCaregiver
    ? 'Give me a short risk prediction summary for my elder. Include diabetes, stroke, and blood pressure risk if data is available, then tell me what needs attention first.'
    : 'Give me a short risk prediction summary for me. Include diabetes, stroke, and blood pressure risk if data is available, then tell me what needs attention first.';
  const actions = { diabetes: onOpenDiabetesPrediction, stroke: onOpenStrokePrediction, hypertension: onOpenHypertensionPrediction };
  const openSummary = () => {
    if (typeof onOpenAssistant === 'function') onOpenAssistant({ initialPrompt: prompt });
    else onOpenSummary?.();
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Ionicons name="arrow-back" size={25} color="#275C4B" />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="pulse-outline" size={21} color="#F8D978" />
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Risk checks</Text>
        </View>
        <View style={styles.accountActionsWrap}>
          <HeaderAccountActions />
        </View>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoIcon}><Ionicons name="shield-checkmark-outline" size={32} color="#275C4B" /></View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Understand Your Risks</Text>
          <Text style={styles.infoDetail}>Review health factors and what to discuss with your care team.</Text>
        </View>
      </View>

      <Pressable onPress={openSummary} accessibilityRole="button" accessibilityLabel="Get risk summary" style={({ pressed }) => [styles.summaryCard, pressed && styles.pressed]}>
        <View style={styles.summaryIcon}><Ionicons name="document-text-outline" size={26} color="#275C4B" /></View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>Your risk summary</Text>
          <Text style={styles.summaryDetail}>Ask Health Helper to explain available results</Text>
        </View>
        <View style={styles.summaryArrow}><Ionicons name="chevron-forward" size={21} color="#275C4B" /></View>
      </Pressable>

      <Text style={styles.sectionTitle}>Choose a check</Text>
      <Text style={styles.sectionDescription}>Select one to review or update your health details.</Text>
      {checks.map((item) => (
        <Pressable key={item.key} onPress={actions[item.key]} accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint={item.detail} style={({ pressed }) => [styles.checkCard, { backgroundColor: item.tint, borderColor: item.border }, pressed && styles.pressed]}>
          <View style={[styles.checkIcon, { backgroundColor: item.color }]}>
            <Ionicons name={item.icon} size={28} color="#FFFFFF" />
          </View>
          <View style={styles.checkCopy}>
            <Text style={styles.checkTitle}>{item.title}</Text>
            <Text style={styles.checkDetail}>{item.detail}</Text>
          </View>
          <View style={[styles.checkArrow, { backgroundColor: item.arrowTint }]}><Ionicons name="chevron-forward" size={21} color={item.color} /></View>
        </Pressable>
      ))}
      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={21} color="#287CB4" />
        <Text style={styles.noteText}>These checks support awareness and do not replace a diagnosis or medical advice.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8F5' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 14, paddingTop: 22, paddingBottom: 110 },
  header: {
    minHeight: 76, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#275C4B', borderColor: '#F4CF75', borderWidth: 2,
    borderRadius: 26, paddingHorizontal: 9, paddingVertical: 8, marginBottom: 24,
    shadowColor: '#20382F', shadowOpacity: 0.17, shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  backButton: { width: 51, height: 51, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerTitleWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 26, fontWeight: '900', marginLeft: 5, flexShrink: 1 },
  accountActionsWrap: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  infoCard: { minHeight: 142, flexDirection: 'row', alignItems: 'center', backgroundColor: '#275C4B', borderColor: '#F4CF75', borderWidth: 2, borderRadius: 22, padding: 17, marginBottom: 16, shadowColor: '#315A4F', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  infoIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: '#F8D978', borderColor: '#FFF4C6', borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  infoCopy: { flex: 1, minWidth: 0 },
  infoTitle: { color: '#FFFFFF', fontSize: 23, lineHeight: 29, fontWeight: '900' },
  infoDetail: { color: '#E9F7F1', fontSize: 16, lineHeight: 22, fontWeight: '600', marginTop: 6 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#DFE6DE', borderWidth: 1, borderRadius: 19, padding: 15, minHeight: 86, marginBottom: 2 },
  summaryIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#EAF4EE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  summaryCopy: { flex: 1, paddingRight: 8 },
  summaryTitle: { color: '#275C4B', fontSize: 18, lineHeight: 24, fontWeight: '900' },
  summaryDetail: { color: '#53645A', fontSize: 14, lineHeight: 20, marginTop: 3 },
  summaryArrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAF4EE', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: '#193D31', fontSize: 22, fontWeight: '900', marginTop: 29 },
  sectionDescription: { color: '#5B7167', fontSize: 16, lineHeight: 23, marginTop: 3, marginBottom: 15 },
  checkCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, minHeight: 112, padding: 15, marginBottom: 13, shadowColor: '#6B5D4B', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  checkIcon: { width: 60, height: 60, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  checkCopy: { flex: 1, paddingRight: 8 },
  checkTitle: { color: '#193D31', fontSize: 19, lineHeight: 25, fontWeight: '900' },
  checkDetail: { color: '#5B7167', fontSize: 15, lineHeight: 21, marginTop: 3 },
  checkArrow: { width: 33, height: 33, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EAF4F8', borderColor: '#D4E7EF', borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 15 },
  noteText: { flex: 1, color: '#4D6870', fontSize: 15, lineHeight: 22, marginLeft: 8 },
  pressed: { opacity: 0.72 },
});
