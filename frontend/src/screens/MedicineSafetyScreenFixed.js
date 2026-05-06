import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { allergyService } from '../services/allergyService';
import { searchMedications } from '../services/medicationService';
import { extractPrescriptionTextFromImage } from '../services/prescriptionOcrService';
import { authService } from '../services/authService';
import {
  cleanExplanationText,
  extractMedicineFromText,
  interactionSeverityUserLabel,
  mergeChronicWithPregnancy,
  parsePregnancyFromChronic,
} from '../utils/medicineFlowUtils';
import { getExpoImagePicker, getExpoSpeech } from '../utils/optionalExpoModules';

const palette = {
  header: '#0a5c3e',
  primary: '#157a52',
  primaryMuted: '#e6f4ec',
  bg: '#eef1f5',
  surface: '#ffffff',
  text: '#0f172a',
  textSecondary: '#475569',
  textTertiary: '#64748b',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  safe: '#0f766e',
  safeBg: '#ecfdf5',
  warn: '#b45309',
  warnBg: '#fffbeb',
  danger: '#b91c1c',
  dangerBg: '#fef2f2',
};

const headerPadTop = Platform.select({
  ios: 52,
  android: (StatusBar.currentHeight ?? 24) + 8,
});

const QUESTIONS = [
  { key: 'pastReaction', label: 'Have you ever had an allergic reaction to medicines?', options: ['Yes', 'No', 'Not sure'] },
  { key: 'reactionSymptoms', label: 'What happened?', options: ['Skin rash', 'Swelling', 'Breathing trouble', 'Vomiting', 'Dizziness', 'Other'], detailKey: 'reactionSymptomsDetail' },
  { key: 'medicineName', label: 'Do you remember the medicine name?', options: ['Yes', 'No'], detailKey: 'medicineNameDetail' },
  { key: 'doctorAdvice', label: 'Did a doctor tell you to avoid any medicine?', options: ['Yes', 'No'], detailKey: 'doctorAdviceDetail' },
  { key: 'painkillerAntibioticReaction', label: 'Have you reacted to antibiotics or painkillers before?', options: ['Yes', 'No', 'Not sure'] },
];

const CHRONIC_CHIPS = ['Diabetes', 'Heart disease', 'Kidney disease', 'Asthma'];
const PREGNANCY_OPTIONS = ['Not applicable', 'Not pregnant', 'Pregnant', 'Prefer not to say'];

const emptyProfile = {
  age: '',
  gender: '',
  hasMedicineAllergy: null,
  knownAllergiesText: '',
  chronicDiseasesText: '',
  currentMedicationsText: '',
  emergencyContact: '',
  caregiverDetails: '',
  profileCompleted: false,
  reactionSymptomsText: '',
  suspectedMedicineNamesText: '',
  avoidedMedicinesText: '',
  antibioticPainkillerReaction: '',
};

const emptyInput = {
  inputMethod: 'manual',
  medicineName: '',
  normalizedDrugName: '',
  dose: '',
  frequency: '',
  rawOcrText: '',
};

const emptyMinimal = {
  newMedicinesNote: '',
  recentReaction: null,
  recentReactionDetail: '',
};

const buildQuestionnaireFromProfileFields = (p) => {
  const past = p.hasMedicineAllergy === true ? 'Yes' : p.hasMedicineAllergy === false ? 'No' : 'Not sure';
  const symptoms = (p.reactionSymptomsText || '').trim() || 'None';
  const medName = (p.suspectedMedicineNamesText || '').trim() ? `Yes: ${(p.suspectedMedicineNamesText || '').trim()}` : 'No';
  const doctor = (p.avoidedMedicinesText || '').trim() ? `Yes: ${(p.avoidedMedicinesText || '').trim()}` : 'No';
  const pain = (p.antibioticPainkillerReaction || '').trim() || 'Not sure';
  return [
    { questionKey: 'pastReaction', answerText: past },
    { questionKey: 'reactionSymptoms', answerText: symptoms },
    { questionKey: 'medicineName', answerText: medName },
    { questionKey: 'doctorAdvice', answerText: doctor },
    { questionKey: 'painkillerAntibioticReaction', answerText: pain },
  ];
};

const normalizeAnswers = (answers = []) => {
  const state = {};
  QUESTIONS.forEach((q) => {
    state[q.key] = '';
    if (q.detailKey) state[q.detailKey] = '';
  });
  answers.forEach((answer) => {
    const q = QUESTIONS.find((item) => item.key === answer.questionKey);
    if (!q) return;
    const raw = answer.answerText || '';
    if (q.detailKey && raw.includes(': ')) {
      const [base, ...rest] = raw.split(': ');
      state[q.key] = base;
      state[q.detailKey] = rest.join(': ');
    } else {
      state[q.key] = raw;
    }
  });
  return state;
};

const profileComplete = (profile) =>
  Boolean(profile.age?.trim()) &&
  Boolean(profile.gender?.trim()) &&
  profile.hasMedicineAllergy !== null &&
  Boolean(profile.emergencyContact?.trim()) &&
  (profile.hasMedicineAllergy === false || Boolean(profile.knownAllergiesText?.trim()));

const questionnaireComplete = (answers) => QUESTIONS.every((item) => Boolean(answers[item.key]));

const isOnboardedUser = (profile, answers) =>
  profile.profileCompleted === true || (questionnaireComplete(answers) && profileComplete(profile));

const errorText = (e, fallback) => e.response?.data?.error || e.message || fallback;
const formatDate = (v) => {
  if (!v) return 'No date';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
};

function speakAloud(text) {
  if (!text) return;
  const Speech = getExpoSpeech();
  if (!Speech) {
    Alert.alert('Read aloud', String(text).slice(0, 500));
    return;
  }
  try {
    Speech.stop();
    Speech.speak(String(text), { rate: 0.9, pitch: 1 });
  } catch {
    Alert.alert('Read aloud', String(text).slice(0, 500));
  }
}

export default function MedicineSafetyScreenFixed({ onBack, onLogout: _onLogout, initialRoute = 'home' }) {
  const [route, setRoute] = useState(initialRoute);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [profile, setProfile] = useState(emptyProfile);
  const [pregnancyNote, setPregnancyNote] = useState('');
  const [answers, setAnswers] = useState(normalizeAnswers());
  const [medicineInput, setMedicineInput] = useState(emptyInput);
  const [minimalCheck, setMinimalCheck] = useState(emptyMinimal);
  const [cards, setCards] = useState([]);
  const [history, setHistory] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [userFirstName, setUserFirstName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [ocrPhase, setOcrPhase] = useState(0);
  const [scanRawText, setScanRawText] = useState('');
  const [voiceDraft, setVoiceDraft] = useState('');
  const [followUp, setFollowUp] = useState({ symptoms: '', severity: 'mild', notes: '' });
  const [standaloneReaction, setStandaloneReaction] = useState({ symptoms: '', severity: 'mild', notes: '' });
  const dangerAlertShown = useRef(false);
  const searchTimer = useRef(null);
  const routeBootstrapped = useRef(false);
  const minimalReturnRoute = useRef('check-input');

  useEffect(() => {
    authService.getStoredUser().then((u) => {
      const name = u?.fullName || u?.name || '';
      setUserFirstName(name.split(/\s+/)[0] || '');
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [p, q, c, h, r] = await Promise.all([
          allergyService.getProfile(),
          allergyService.getQuestionnaire(),
          allergyService.getCards(),
          allergyService.getHistory(),
          allergyService.getReactions().catch(() => []),
        ]);
        const parsed = parsePregnancyFromChronic(p.chronicDiseasesText);
        setProfile({
          ...emptyProfile,
          ...p,
          chronicDiseasesText: parsed.chronicRest,
          profileCompleted: Boolean(p.profileCompleted),
          reactionSymptomsText: p.reactionSymptomsText || '',
          suspectedMedicineNamesText: p.suspectedMedicineNamesText || '',
          avoidedMedicinesText: p.avoidedMedicinesText || '',
          antibioticPainkillerReaction: p.antibioticPainkillerReaction || '',
        });
        setPregnancyNote(parsed.pregnancy);
        setAnswers(normalizeAnswers(q));
        setCards(c);
        setHistory(h);
        setReactions(Array.isArray(r) ? r : []);
      } catch (e) {
        Alert.alert('Load failed', errorText(e, 'Could not load medicine safety.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (route !== 'result' || !latestResult?.card) return;
    if (latestResult.card.riskLevel !== 'Dangerous') return;
    if (dangerAlertShown.current) return;
    dangerAlertShown.current = true;
    const caregiver = profile.caregiverDetails?.trim();
    Alert.alert(
      'Important safety alert',
      caregiver
        ? 'This result is dangerous. Do not take this medicine until a doctor says it is safe. Your caregiver on file should be informed — in a full deployment the app would send them an automatic alert.'
        : 'This result is dangerous. Do not take this medicine until a doctor says it is safe. Add caregiver details in your profile so someone can be notified automatically in a connected build.',
      [{ text: 'I understand' }]
    );
  }, [route, latestResult, profile.caregiverDetails]);

  const historyItems = useMemo(
    () =>
      history.map((item) => ({
        ...item,
        card: cards.find((card) => String(card.medicineName || '').toLowerCase() === String(item.medicineName || '').toLowerCase()),
      })),
    [history, cards]
  );

  const isOnboarded = useMemo(() => isOnboardedUser(profile, answers), [profile, answers]);

  useEffect(() => {
    if (loading) return;
    if (initialRoute !== 'home') {
      setRoute(initialRoute);
      return;
    }
    if (!routeBootstrapped.current) {
      routeBootstrapped.current = true;
      setRoute(isOnboarded ? 'home' : 'onboarding');
    }
  }, [loading, initialRoute, isOnboarded]);

  const latestHistoryItem = historyItems[0];
  const pregnancyApplicable = profile.gender === 'Female';

  const runMedicationSearch = useCallback(async (text) => {
    const t = String(text || '').trim();
    if (t.length < 2) {
      setSuggestions([]);
      return;
    }
    setSearchBusy(true);
    const results = await searchMedications(t);
    setSuggestions(results.slice(0, 8));
    setSearchBusy(false);
  }, []);

  const onMedicineNameChange = (v) => {
    setMedicineInput((m) => ({ ...m, medicineName: v, normalizedDrugName: v.toLowerCase(), inputMethod: 'manual' }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runMedicationSearch(v), 350);
  };

  const pickSuggestion = (item) => {
    const name = item.displayName || item.ingredientName || '';
    setMedicineInput((m) => ({
      ...m,
      medicineName: name,
      normalizedDrugName: (item.normalizedName || name).toLowerCase(),
      inputMethod: 'manual',
    }));
    setSuggestions([]);
  };

  const openMedicineHub = () => {
    if (!isOnboarded) {
      setOnboardingStep(0);
      setRoute('onboarding');
      return;
    }
    setRoute('medicine-hub');
  };

  const syncQuestionnaireFromProfile = async (profilePayload) => {
    const qa = buildQuestionnaireFromProfileFields(profilePayload);
    const saved = await allergyService.saveQuestionnaire(qa);
    setAnswers(normalizeAnswers(saved));
  };

  const saveProfile = async () => {
    if (!profileComplete(profile)) {
      Alert.alert('Missing details', 'Please fill age, gender, medicine allergy, emergency contact, and known allergies if you said yes.');
      return;
    }
    const chronicFull = mergeChronicWithPregnancy(profile.chronicDiseasesText, pregnancyNote, profile.gender);
    const body = {
      ...profile,
      chronicDiseasesText: chronicFull,
      profileCompleted:
        Boolean(profile.profileCompleted) || profileComplete({ ...profile, chronicDiseasesText: chronicFull }),
    };
    try {
      setSaving(true);
      const saved = await allergyService.saveProfile(body);
      const parsed = parsePregnancyFromChronic(saved.chronicDiseasesText);
      const merged = { ...emptyProfile, ...saved, chronicDiseasesText: parsed.chronicRest };
      setProfile(merged);
      setPregnancyNote(parsed.pregnancy);
      const forSync = { ...merged, chronicDiseasesText: chronicFull };
      if (profileComplete(forSync)) {
        await syncQuestionnaireFromProfile(forSync);
      }
      setRoute('home');
    } catch (e) {
      Alert.alert('Save failed', errorText(e, 'Could not save health profile.'));
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentMedicinesOnly = async () => {
    try {
      setSaving(true);
      const chronicFull = mergeChronicWithPregnancy(profile.chronicDiseasesText, pregnancyNote, profile.gender);
      const body = {
        ...profile,
        chronicDiseasesText: chronicFull,
        profileCompleted: true,
      };
      const saved = await allergyService.saveProfile(body);
      const parsed = parsePregnancyFromChronic(saved.chronicDiseasesText);
      const merged = { ...emptyProfile, ...saved, chronicDiseasesText: parsed.chronicRest };
      setProfile(merged);
      setPregnancyNote(parsed.pregnancy);
      await syncQuestionnaireFromProfile({ ...merged, chronicDiseasesText: chronicFull });
      Alert.alert('Saved', 'Your current medicines list was updated.');
      setRoute('home');
    } catch (e) {
      Alert.alert('Save failed', errorText(e, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  const completeOnboarding = async () => {
    if (!profileComplete(profile)) {
      Alert.alert('Missing details', 'Please complete all required fields.');
      return;
    }
    const chronicFull = mergeChronicWithPregnancy(profile.chronicDiseasesText, pregnancyNote, profile.gender);
    const body = {
      ...profile,
      chronicDiseasesText: chronicFull,
      profileCompleted: true,
    };
    try {
      setSaving(true);
      const saved = await allergyService.saveProfile(body);
      const parsed = parsePregnancyFromChronic(saved.chronicDiseasesText);
      const merged = { ...emptyProfile, ...saved, chronicDiseasesText: parsed.chronicRest };
      setProfile(merged);
      setPregnancyNote(parsed.pregnancy);
      await syncQuestionnaireFromProfile({ ...merged, chronicDiseasesText: chronicFull });
      setOnboardingStep(0);
      setRoute('home');
    } catch (e) {
      Alert.alert('Save failed', errorText(e, 'Could not finish setup.'));
    } finally {
      setSaving(false);
    }
  };

  const appendChronicChip = (label) => {
    setProfile((p) => {
      const cur = p.chronicDiseasesText || '';
      if (cur.toLowerCase().includes(label.toLowerCase())) return p;
      const next = cur ? `${cur}, ${label}` : label;
      return { ...p, chronicDiseasesText: next };
    });
  };

  const buildAnalysisNotes = () => {
    const parts = [];
    if (medicineInput.rawOcrText) {
      parts.push(`OCR / prescription text:\n${medicineInput.rawOcrText}`);
    }
    if (minimalCheck.newMedicinesNote?.trim()) {
      parts.push(`New medicines (not on profile yet): ${minimalCheck.newMedicinesNote.trim()}`);
    }
    if (minimalCheck.recentReaction === true) {
      parts.push(
        minimalCheck.recentReactionDetail?.trim()
          ? `Recent reaction reported: ${minimalCheck.recentReactionDetail.trim()}`
          : 'User reported a recent reaction (see symptom field).'
      );
    }
    return parts.join('\n\n').trim();
  };

  const checkMedicine = async () => {
    if (!medicineInput.medicineName.trim()) {
      Alert.alert('Missing medicine', 'Please enter a medicine name first.');
      return;
    }
    const hasOtherMeds =
      Boolean(profile.currentMedicationsText?.trim()) || Boolean(minimalCheck.newMedicinesNote?.trim());
    try {
      setRoute('loading');
      const result = await allergyService.analyzeMedicine({
        ...medicineInput,
        takenBefore: null,
        hadReactionBefore:
          minimalCheck.recentReaction === true ? true : minimalCheck.recentReaction === false ? false : null,
        symptomMatch: minimalCheck.recentReactionDetail || '',
        severity: 'mild',
        notes: buildAnalysisNotes(),
        takingOtherMedicinesNow: hasOtherMeds,
        normalizedDrugName: medicineInput.normalizedDrugName || medicineInput.medicineName.toLowerCase(),
      });
      setLatestResult(result);
      setCards((prev) => [result.card, ...prev.filter((item) => item.id !== result.card.id)]);
      setHistory(await allergyService.getHistory());
      setSelectedCard(result.card);
      setMedicineInput(emptyInput);
      setMinimalCheck(emptyMinimal);
      dangerAlertShown.current = false;
      setRoute('result');
    } catch (e) {
      Alert.alert('Check failed', errorText(e, 'Could not check medicine safety.'));
      setRoute('check-minimal');
    }
  };

  const submitStandaloneReaction = async () => {
    if (!standaloneReaction.symptoms.trim()) {
      Alert.alert('Symptoms needed', 'Please describe the reaction.');
      return;
    }
    try {
      setSaving(true);
      await allergyService.saveReaction({
        medicineCheckId: null,
        symptoms: standaloneReaction.symptoms,
        severity: standaloneReaction.severity,
        notes: standaloneReaction.notes || '',
      });
      setReactions(await allergyService.getReactions().catch(() => []));
      Alert.alert('Saved', 'Reaction logged. It will be kept with your allergy history.');
      setStandaloneReaction({ symptoms: '', severity: 'mild', notes: '' });
      setRoute('home');
    } catch (e) {
      Alert.alert('Save failed', errorText(e, 'Could not save reaction.'));
    } finally {
      setSaving(false);
    }
  };

  const submitFollowUp = async () => {
    if (!followUp.symptoms.trim()) {
      Alert.alert('Symptoms needed', 'Please describe how you felt.');
      return;
    }
    try {
      setSaving(true);
      await allergyService.saveReaction({
        medicineCheckId: null,
        symptoms: followUp.symptoms,
        severity: followUp.severity,
        notes: [followUp.notes, latestResult?.card?.id ? `Related check card id: ${latestResult.card.id}` : ''].filter(Boolean).join('\n'),
      });
      Alert.alert('Thank you', 'Your follow-up was saved. Future checks can use this information.');
      setFollowUp({ symptoms: '', severity: 'mild', notes: '' });
      setRoute('home');
    } catch (e) {
      Alert.alert('Save failed', errorText(e, 'Could not save follow-up.'));
    } finally {
      setSaving(false);
    }
  };

  const startScanFlow = async () => {
    const ImagePicker = getExpoImagePicker();
    if (!ImagePicker) {
      Alert.alert(
        'Rebuild app for photos',
        'This install does not include the photo library native module (ExponentImagePicker). Run a new native build: npx expo prebuild (if needed) then npx expo run:android, or eas build --profile development. Expo Go on SDK 50 normally includes it; custom dev clients must be rebuilt after adding expo-image-picker. For now, type or paste prescription text on the next screen.',
        [{ text: 'Continue', onPress: () => setRoute('scan-text') }]
      );
      return;
    }
    let picked;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to scan a prescription image.');
        return;
      }
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });
    } catch (e) {
      const msg = errorText(e, '');
      if (/ExponentImagePicker|native module/i.test(msg)) {
        Alert.alert(
          'Photo library unavailable',
          'Rebuild the app with expo-image-picker linked (expo run:android or EAS dev build). You can enter prescription text manually on the next screen.',
          [{ text: 'OK', onPress: () => setRoute('scan-text') }]
        );
        return;
      }
      Alert.alert('Could not open photos', errorText(e, 'Try again or enter text manually.'));
      return;
    }
    if (picked.canceled) return;
    const asset = picked.assets?.[0];
    const uri = asset?.uri;
    if (!uri) {
      Alert.alert('No image', 'Could not read the selected photo. Try another image.');
      return;
    }
    setScanRawText('');
    setOcrPhase(1);
    setRoute('scan-process');
    const phaseTimer = setTimeout(() => setOcrPhase(2), 1500);
    try {
      const mimeType = asset.mimeType || 'image/jpeg';
      const { rawText, message, preprocessing } = await extractPrescriptionTextFromImage(uri, mimeType);
      setScanRawText(rawText);
      setOcrPhase(3);
      if (Array.isArray(preprocessing?.applied) && preprocessing.applied.length > 0) {
        Alert.alert(
          'OCR preprocessing applied',
          `Image steps: ${preprocessing.applied.join(', ')}. Please review and correct extracted text before continuing.`
        );
      }
      if (!String(rawText || '').trim() && message) {
        Alert.alert('No text found', `${message} You can type the prescription below.`);
      }
    } catch (e) {
      Alert.alert(
        'OCR unavailable',
        `${errorText(e, 'Could not reach the server or process the image.')} You can type or paste the prescription text on the next screen.`
      );
      setScanRawText('');
    } finally {
      clearTimeout(phaseTimer);
      setRoute('scan-text');
    }
  };

  const applyParsedPrescription = () => {
    const parsed = extractMedicineFromText(scanRawText);
    setMedicineInput({
      inputMethod: 'scan',
      medicineName: parsed.medicineName || scanRawText.split('\n')[0]?.trim() || '',
      normalizedDrugName: (parsed.medicineName || '').toLowerCase(),
      dose: parsed.dose,
      frequency: parsed.displayFrequency || parsed.frequency,
      rawOcrText: scanRawText,
    });
    setRoute('confirm');
  };

  const startVoiceFlow = () => {
    setVoiceDraft(medicineInput.medicineName);
    setRoute('voice-input');
    setTimeout(() => {
      speakAloud('Say the medicine name clearly. You can also type it below, or use the microphone on your keyboard.');
    }, 400);
  };

  const confirmVoice = () => {
    const name = voiceDraft.trim();
    if (!name) {
      Alert.alert('Missing name', 'Type or dictate the medicine name.');
      return;
    }
    const parsed = extractMedicineFromText(name);
    setMedicineInput({
      inputMethod: 'voice',
      medicineName: parsed.medicineName || name,
      normalizedDrugName: (parsed.medicineName || name).toLowerCase(),
      dose: parsed.dose,
      frequency: parsed.displayFrequency || parsed.frequency,
      rawOcrText: '',
    });
    setRoute('confirm');
  };

  const tone = (risk) =>
    risk === 'Dangerous'
      ? {
          box: s.danger,
          text: s.dangerText,
          banner: s.bannerDanger,
          pill: s.pillDanger,
          pillText: s.pillDangerText,
          sub: 'Do not take without speaking to your doctor',
          barFill: palette.danger,
        }
      : risk === 'Safe'
        ? {
            box: s.safe,
            text: s.safeText,
            banner: s.bannerSafe,
            pill: s.pillSafe,
            pillText: s.pillSafeText,
            sub: 'Lower concern on this check — still follow your prescriber',
            barFill: palette.safe,
          }
        : {
            box: s.warn,
            text: s.warnText,
            banner: s.bannerWarn,
            pill: s.pillWarn,
            pillText: s.pillWarnText,
            sub: 'Extra caution — confirm with pharmacist or doctor',
            barFill: palette.warn,
          };

  const displaySideEffects = (effects = [], limit = 6) => (Array.isArray(effects) ? effects.filter(Boolean).slice(0, limit) : []);
  const displayInteractions = (items = [], limit = 5) => (Array.isArray(items) ? items.filter(Boolean).slice(0, limit) : []);

  const resultBody = (card, analysis = null) => {
    if (!card) return null;
    const t = tone(String(card.riskLevel || 'Warning'));
    const ml = analysis?.mlPrediction || analysis?.medicationKnowledge?.mlPrediction;
    const dataUsed = analysis?.dataUsed || {};
    const ruleScore = Number.isFinite(Number(dataUsed.ruleScore)) ? dataUsed.ruleScore : null;
    const mlScore = Number.isFinite(Number(dataUsed.mlScore)) ? dataUsed.mlScore : ml?.available ? ml.mlRiskScore : null;
    const finalScore = card.riskScore;
    const sev = interactionSeverityUserLabel(card.maxInteractionSeverity || analysis?.medicationKnowledge?.interactions?.[0]?.severity);
    const mk = analysis?.medicationKnowledge || {};
    const interactions = displayInteractions(mk.interactions);

    return (
      <>
        <Text style={s.resultMedLabel}>Medicine checked</Text>
        <Text style={s.med}>{card.medicineName || 'Medicine'}</Text>
        <View style={[s.banner, t.banner]}>
          <View style={[s.riskPill, t.pill]}>
            <Text style={[s.riskPillText, t.pillText]}>{card.riskLevel || 'Warning'}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.bannerTitle}>Safety level</Text>
            <Text style={[s.bannerSub, t.text]}>{t.sub}</Text>
          </View>
        </View>

        {card.riskLevel === 'Dangerous' ? (
          <View style={s.emergencyBanner}>
            <Text style={s.emergencyTitle}>Emergency</Text>
            <Text style={s.emergencyText}>
              Contact your doctor or go to urgent care if you already took this medicine and feel unwell. If breathing is hard or swelling is
              severe, call emergency services.
            </Text>
            {profile.caregiverDetails?.trim() ? (
              <Text style={s.caregiverNote}>
                Caregiver on file: {profile.caregiverDetails.trim()} — a full app build could message them automatically for dangerous results.
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={s.scoreBlock}>
          <Text style={s.scoreBlockTitle}>Risk scores (how we decided)</Text>
          <Text style={s.scoreLine}>Final score: {finalScore ?? '--'} / 100</Text>
          <Text style={s.scoreHint}>Levels: 0–24 Safe · 25–59 Warning · 60–100 Dangerous</Text>
          {ruleScore != null ? <Text style={s.scoreLine}>Rule-based clinical score: {ruleScore} / 100</Text> : null}
          {mlScore != null ? (
            <Text style={s.scoreLine}>ML score — P(Dangerous) × 100: {mlScore} / 100</Text>
          ) : null}
          <Text style={s.scoreHint}>
            Final blend uses clinical rules and ML P(Dangerous) (about 55% rules, 45% ML), with safety guardrails.
          </Text>
          {Number(dataUsed.historyPriorCheckCount) > 0 ? (
            <Text style={s.scoreHint}>
              Your saved history for this drug: {dataUsed.historyPriorCheckCount} prior check(s) — latest was{' '}
              {dataUsed.historyLatestRiskLevel || 'unknown'}
              {Number(dataUsed.historyDangerousCount) > 0
                ? ` (${dataUsed.historyDangerousCount} marked Dangerous)`
                : Number(dataUsed.historyWarningCount) > 0
                  ? ` (${dataUsed.historyWarningCount} marked Warning)`
                  : ''}
              .
            </Text>
          ) : null}
          {dataUsed.knowledgeMatched === false ? (
            <Text style={s.scoreHint}>
              Public drug knowledge matched weakly for this name — fix spelling or add strength so interactions and side effects are complete.
            </Text>
          ) : null}
        </View>

        <View style={s.scoreRow}>
          <Text style={s.scoreLabel}>Final bar</Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.max(8, Number(card.riskScore || 0))}%`, backgroundColor: t.barFill }]} />
          </View>
          <Text style={s.scoreValue}>{card.riskScore ?? '--'}/100</Text>
        </View>

        {Number(card.interactionCount) > 0 ? (
          <View style={s.interactionCard}>
            <Text style={s.interactionTitle}>Interaction alert</Text>
            <Text style={s.interactionLevel}>
              Highest level with your current medicines: {sev}
              {card.maxInteractionSeverity ? ` (clinical: ${card.maxInteractionSeverity})` : ''}
            </Text>
            <Text style={s.helpSmall}>Major means seek advice before taking; moderate means pharmacist review; minor means usually watch and monitor.</Text>
          </View>
        ) : null}

        <View style={s.card}>
          <Text style={s.cardTitle}>Why this result?</Text>
          <Text style={s.cardText}>{cleanExplanationText(card.explanation)}</Text>
        </View>

        <View style={[s.card, t.box]}>
          <Text style={[s.cardTitle, t.text]}>Recommendation</Text>
          <Text style={[s.cardText, t.text]}>{card.recommendation || 'No recommendation available.'}</Text>
        </View>

        {mk.ingredientName ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Drug information summary</Text>
            <Text style={s.cardText}>
              {[
                mk.ingredientName ? `Active ingredient: ${mk.ingredientName}` : null,
                mk.therapeuticClass ? `Class: ${mk.therapeuticClass}` : null,
                mk.rxnormMatchedName ? `Standard name: ${mk.rxnormMatchedName}` : null,
              ]
                .filter(Boolean)
                .join('\n')}
            </Text>
          </View>
        ) : null}

        {ml?.available ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Machine learning check</Text>
            <Text style={s.cardText}>Support score: {ml.mlRiskScore ?? '--'} / 100 ({ml.mlRiskLevel || 'n/a'})</Text>
            <Text style={s.helpSmall}>Random-forest style model — supports, but does not replace, clinical checks.</Text>
          </View>
        ) : null}

        {interactions.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Interaction details</Text>
            {interactions.map((item, index) => (
              <View key={`${item.interactingDrug || index}`} style={{ marginBottom: 10 }}>
                <Text style={s.bullet}>{`\u2022 ${item.interactingDrug || item.interactingNormalizedDrug || 'Another medicine'} (${interactionSeverityUserLabel(item.severity)})`}</Text>
                {item.description ? <Text style={s.helpSmall}>{item.description}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {displaySideEffects(mk.commonSideEffects).length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Common side effects</Text>
            {displaySideEffects(mk.commonSideEffects).map((item, index) => (
              <Text key={`c-${index}`} style={s.bullet}>{`\u2022 ${item}`}</Text>
            ))}
          </View>
        ) : null}

        {displaySideEffects(mk.severeSideEffects, 4).length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Serious side effects to know</Text>
            {displaySideEffects(mk.severeSideEffects, 4).map((item, index) => (
              <Text key={`s-${index}`} style={[s.bullet, s.dangerText]}>{`\u2022 ${item}`}</Text>
            ))}
          </View>
        ) : null}
      </>
    );
  };

  const header = (title, readText) => (
    <>
      <StatusBar barStyle="light-content" backgroundColor={palette.header} />
      <View style={[s.top, { paddingTop: headerPadTop }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={s.back}
          onPress={
            route === 'home'
              ? onBack
              : () => {
                  if (route === 'onboarding') {
                    if (onboardingStep > 0) setOnboardingStep((x) => x - 1);
                    else onBack();
                    return;
                  }
                  if (route === 'scan-text' || route === 'scan-process') setRoute('medicine-hub');
                  else if (route === 'voice-input') setRoute('medicine-hub');
                  else if (route === 'check-input') setRoute('medicine-hub');
                  else if (route === 'check-minimal') setRoute(minimalReturnRoute.current || 'medicine-hub');
                  else if (route === 'profile-medicines' || route === 'reaction-log') setRoute('home');
                  else if (route === 'profile-edit') setRoute('profile-view');
                  else if (route === 'profile-view') setRoute('home');
                  else setRoute('home');
                }
          }
        >
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <View style={s.topTitleWrap}>
          <Text style={s.topTitle} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {readText ? (
          <TouchableOpacity style={s.speakTop} onPress={() => speakAloud(readText)} accessibilityLabel="Read screen aloud">
            <Text style={s.speakTopText}>🔊</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.speakTopPlaceholder} />
        )}
      </View>
    </>
  );

  if (loading || route === 'loading') {
    return (
      <View style={s.screen}>
        {header(route === 'loading' ? 'Checking safety' : 'Medicine safety', 'Checking your medicine. Please wait.')}
        <View style={s.center}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={s.loadTitle}>Checking medicine safety…</Text>
          <Text style={s.loadText}>Rules, your profile, interactions, and the learning model are combined.</Text>
        </View>
      </View>
    );
  }

  if (route === 'home') {
    const profileReadyChip = profile.profileCompleted === true || profileComplete(profile);
    const allergyHistoryChip = questionnaireComplete(answers);
    const readHome = `Medicine safety. ${
      isOnboarded
        ? 'Your allergy profile is saved and reused every time you check a medicine — only quick updates when needed.'
        : 'Finish one-time setup so we can personalize every medicine check.'
    } Tap check a medicine to continue.`;
    return (
      <View style={s.screen}>
        {header('Medicine safety', readHome)}
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={s.eyebrow}>Medicine safety</Text>
          <View style={s.moduleHero}>
            <View style={s.moduleHeroTop}>
              <View style={s.circle}>
                <Text style={s.circleText}>{(userFirstName || 'You').slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitle}>Hello{userFirstName ? `, ${userFirstName}` : ''}</Text>
                <Text style={s.heroSub}>Check a new medicine against your allergies, conditions, and current tablets — with clear results you can share with a doctor or pharmacist.</Text>
              </View>
            </View>
            <View style={s.statusRow}>
              <View style={[s.statusChip, profileReadyChip ? s.statusReady : s.statusPending]}>
                <Text style={[s.statusChipText, profileReadyChip ? s.statusReadyText : s.statusPendingText]}>
                  {profileReadyChip ? 'Profile on file' : 'Finish profile'}
                </Text>
              </View>
              <View style={[s.statusChip, allergyHistoryChip ? s.statusReady : s.statusPending]}>
                <Text style={[s.statusChipText, allergyHistoryChip ? s.statusReadyText : s.statusPendingText]}>
                  {allergyHistoryChip ? 'Allergy history saved' : 'Allergy history needed'}
                </Text>
              </View>
            </View>
            {reactions.length > 0 ? (
              <Text style={s.helpSmall}>{reactions.length} reaction{reactions.length === 1 ? '' : 's'} logged in your history.</Text>
            ) : null}
          </View>

          <View style={s.disclaimerCard}>
            <Text style={s.disclaimerText}>
              This tool supports your decisions only — it is not a diagnosis. Always follow advice from your clinician or pharmacist.
            </Text>
          </View>

          <TouchableOpacity
            style={[s.bigPrimary, s.primaryActionCard]}
            onPress={openMedicineHub}
            accessibilityRole="button"
            accessibilityLabel="Check a medicine"
            activeOpacity={0.88}
          >
            <View style={s.ctaInner}>
              <View style={s.ctaIconBubble}>
                <Text style={s.ctaIcon}>💊</Text>
              </View>
              <View style={s.ctaTextCol}>
                <Text style={s.bigPrimaryText}>Check a medicine</Text>
                <Text style={s.bigPrimarySub}>{isOnboarded ? 'Type, scan photo, or voice — quick check only' : 'We’ll finish setup if needed'}</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryBig} onPress={() => speakAloud(readHome)} activeOpacity={0.85}>
            <Text style={s.secondaryBigText}>🔊 Read this screen aloud</Text>
          </TouchableOpacity>

          <Text style={s.sectionTitle}>Shortcuts</Text>
          <View style={s.shortcutRow}>
            <TouchableOpacity style={s.shortcutHalf} onPress={() => setRoute('profile-view')} activeOpacity={0.88}>
              <Text style={s.shortcutIcon}>👤</Text>
              <Text style={s.shortcutTitle}>Health profile</Text>
              <Text style={s.shortcutSub}>View saved details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shortcutHalf} onPress={() => setRoute('history')} activeOpacity={0.88}>
              <Text style={s.shortcutIcon}>📋</Text>
              <Text style={s.shortcutTitle}>History</Text>
              <Text style={s.shortcutSub} numberOfLines={2}>
                {latestHistoryItem ? `${latestHistoryItem.medicineName}` : 'Past checks'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={s.shortcutRow}>
            <TouchableOpacity style={s.shortcutHalf} onPress={() => setRoute('profile-edit')} activeOpacity={0.88}>
              <Text style={s.shortcutIcon}>✏️</Text>
              <Text style={s.shortcutTitle}>Edit allergy profile</Text>
              <Text style={s.shortcutSub}>Update history</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.shortcutHalf} onPress={() => setRoute('profile-medicines')} activeOpacity={0.88}>
              <Text style={s.shortcutIcon}>💊</Text>
              <Text style={s.shortcutTitle}>Current medicines</Text>
              <Text style={s.shortcutSub}>Quick update list</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[s.secondaryBig, { marginTop: 4 }]} onPress={() => setRoute('reaction-log')} activeOpacity={0.88}>
            <Text style={s.secondaryBigText}>➕ Log a new reaction</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'medicine-hub') {
    const hubRead = 'Choose how to enter the medicine. Type medicine name, scan a prescription image, or speak medicine name.';
    return (
      <View style={s.screen}>
        {header('How do you want to enter the medicine?', hubRead)}
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={s.lead}>Choose how to enter the medicine. You can correct everything before the safety check runs.</Text>
          <TouchableOpacity style={s.hubRow} onPress={() => setRoute('check-input')} activeOpacity={0.88}>
            <View style={[s.hubIcon, s.hubIconTeal]}>
              <Text style={s.hubEmoji}>⌨️</Text>
            </View>
            <View style={s.hubRowBody}>
              <Text style={s.hubRowTitle}>Type medicine</Text>
              <Text style={s.hubRowSub}>Type medicine name with smart suggestions</Text>
            </View>
            <Text style={s.hubChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.hubRow} onPress={startScanFlow} activeOpacity={0.88}>
            <View style={[s.hubIcon, s.hubIconBlue]}>
              <Text style={s.hubEmoji}>📷</Text>
            </View>
            <View style={s.hubRowBody}>
              <Text style={s.hubRowTitle}>Scan prescription</Text>
              <Text style={s.hubRowSub}>Prescription image → OCR text → parse dose/frequency</Text>
            </View>
            <Text style={s.hubChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.hubRow} onPress={startVoiceFlow} activeOpacity={0.88}>
            <View style={[s.hubIcon, s.hubIconViolet]}>
              <Text style={s.hubEmoji}>🎤</Text>
            </View>
            <View style={s.hubRowBody}>
              <Text style={s.hubRowTitle}>Voice input</Text>
              <Text style={s.hubRowSub}>Speak medicine name (or type with keyboard mic)</Text>
            </View>
            <Text style={s.hubChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBig} onPress={() => speakAloud(hubRead)} activeOpacity={0.85}>
            <Text style={s.secondaryBigText}>🔊 Read aloud</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'scan-process') {
    const labels = ['', 'Sending photo securely…', 'Extracting text (OCR)…', 'Almost done…'];
    return (
      <View style={s.screen}>
        {header('Reading prescription', 'We are processing your prescription photo.')}
        <View style={s.center}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={s.loadTitle}>Processing image…</Text>
          <Text style={s.loadText}>{labels[ocrPhase] || 'Preparing…'}</Text>
          <Text style={s.helpSmall}>
            The server runs optical character recognition (Tesseract). Please wait—first run can take longer while language data loads. You will review every word before validation or safety checks.
          </Text>
        </View>
      </View>
    );
  }

  if (route === 'scan-text') {
    return (
      <View style={s.screen}>
        {header('Prescription text', 'Check the text from your prescription. Edit it if needed, then parse.')}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.lead}>
              OCR may misread handwriting—correct any mistakes here. If the box is empty, type what is on the prescription or use the sample to try the flow.
            </Text>
            <TextInput
              style={[s.input, s.areaLarge]}
              value={scanRawText}
              onChangeText={setScanRawText}
              placeholder={'Example: Panadol 500 mg twice daily'}
              multiline
            />
            <TouchableOpacity
              style={s.secondaryBig}
              onPress={() => setScanRawText('Amoxicillin 500 mg tds')}
            >
              <Text style={s.secondaryBigText}>Use sample line (demo)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bigPrimary} onPress={applyParsedPrescription}>
              <Text style={s.bigPrimaryText}>Parse & continue</Text>
            </TouchableOpacity>
            <Text style={s.helpSmall}>NLP splits name, dose, and frequency when it can (for example “500 mg” and “twice daily”).</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (route === 'voice-input') {
    return (
      <View style={s.screen}>
        {header('Voice input', 'Say the medicine name clearly. You can type below.')}
        <ScrollView contentContainerStyle={s.content}>
          <TouchableOpacity style={s.secondaryBig} onPress={() => speakAloud('Say the medicine name clearly. You can also type it below.')}>
            <Text style={s.secondaryBigText}>Play instruction again</Text>
          </TouchableOpacity>
          <Text style={s.lead}>Many phones offer a microphone on the keyboard for speech-to-text. Otherwise, type the name.</Text>
          <TextInput style={s.input} value={voiceDraft} onChangeText={setVoiceDraft} placeholder="Medicine name" />
          <TouchableOpacity style={s.bigPrimary} onPress={confirmVoice}>
            <Text style={s.bigPrimaryText}>Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'profile-view') {
    const chronicDisplay = mergeChronicWithPregnancy(profile.chronicDiseasesText, pregnancyNote, profile.gender);
    return (
      <View style={s.screen}>
        {header('My profile', 'Your saved health information for medicine safety.')}
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.profileTop}>
            <View style={s.bigCircle}>
              <Text style={s.bigCircleText}>{(userFirstName || 'Y').slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={s.profileTitle}>Your details</Text>
            <Text style={s.profileMeta}>
              Age {profile.age || '—'} · {profile.gender || '—'}
            </Text>
          </View>
          {[
            ['Known drug allergies', profile.knownAllergiesText || 'Not added'],
            ['Past reaction symptoms', profile.reactionSymptomsText?.trim() || 'Not added'],
            ['Suspected medicine names', profile.suspectedMedicineNamesText?.trim() || 'Not added'],
            ['Medicines or classes to avoid', profile.avoidedMedicinesText?.trim() || 'Not added'],
            ['Antibiotics / painkillers reaction', profile.antibioticPainkillerReaction?.trim() || 'Not added'],
            ['Chronic conditions', chronicDisplay || 'Not added'],
            ['Current medicines', profile.currentMedicationsText || 'Not added'],
            ['Emergency contact', profile.emergencyContact || 'Not added'],
            ['Caregiver', profile.caregiverDetails || 'Not added'],
          ].map(([label, value]) => (
            <View key={label} style={s.card}>
              <Text style={s.small}>{label}</Text>
              <Text style={s.cardText}>{value}</Text>
            </View>
          ))}
          <TouchableOpacity style={s.bigPrimary} onPress={() => setRoute('profile-edit')}>
            <Text style={s.bigPrimaryText}>Update profile</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'profile-edit') {
    return (
      <View style={s.screen}>
        {header('Health profile', 'Fill in your details for safer medicine checks.')}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <Text style={s.lead}>We load saved details for returning users. New users fill this once.</Text>
            <TextInput style={s.input} value={profile.age} onChangeText={(v) => setProfile((p) => ({ ...p, age: v }))} placeholder="Age" keyboardType="numeric" />
            <Text style={s.fieldLabel}>Gender</Text>
            <View style={s.row}>
              {['Male', 'Female', 'Other'].map((gender) => (
                <TouchableOpacity key={gender} style={[s.chip, profile.gender === gender && s.chipOn]} onPress={() => setProfile((p) => ({ ...p, gender }))}>
                  <Text style={[s.chipText, profile.gender === gender && s.chipTextOn]}>{gender}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {pregnancyApplicable ? (
              <>
                <Text style={s.fieldLabel}>Pregnancy (if this applies)</Text>
                <View style={s.row}>
                  {PREGNANCY_OPTIONS.map((opt) => (
                    <TouchableOpacity key={opt} style={[s.chip, pregnancyNote === opt && s.chipOn]} onPress={() => setPregnancyNote(opt)}>
                      <Text style={[s.chipText, pregnancyNote === opt && s.chipTextOn]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
            <Text style={s.fieldLabel}>Any known medicine allergy?</Text>
            <View style={s.row}>
              {[
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[s.chip, profile.hasMedicineAllergy === item.value && s.chipOn]}
                  onPress={() => setProfile((p) => ({ ...p, hasMedicineAllergy: item.value }))}
                >
                  <Text style={[s.chipText, profile.hasMedicineAllergy === item.value && s.chipTextOn]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.input, s.area]}
              value={profile.knownAllergiesText}
              onChangeText={(v) => setProfile((p) => ({ ...p, knownAllergiesText: v }))}
              placeholder="Known drug allergies (names if you know them)"
              multiline
            />
            <Text style={s.fieldLabel}>Past reaction symptoms</Text>
            <TextInput
              style={[s.input, s.area]}
              value={profile.reactionSymptomsText}
              onChangeText={(v) => setProfile((p) => ({ ...p, reactionSymptomsText: v }))}
              placeholder="e.g. rash, swelling, breathing trouble"
              multiline
            />
            <Text style={s.fieldLabel}>Suspected medicine names</Text>
            <TextInput
              style={s.input}
              value={profile.suspectedMedicineNamesText}
              onChangeText={(v) => setProfile((p) => ({ ...p, suspectedMedicineNamesText: v }))}
              placeholder="Medicines you think caused a reaction"
            />
            <Text style={s.fieldLabel}>Doctor said to avoid (medicines or classes)</Text>
            <TextInput
              style={[s.input, s.area]}
              value={profile.avoidedMedicinesText}
              onChangeText={(v) => setProfile((p) => ({ ...p, avoidedMedicinesText: v }))}
              placeholder="List avoids from your doctor"
              multiline
            />
            <Text style={s.fieldLabel}>Reacted to antibiotics or painkillers before?</Text>
            <View style={s.row}>
              {['Yes', 'No', 'Not sure'].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[s.chip, profile.antibioticPainkillerReaction === opt && s.chipOn]}
                  onPress={() => setProfile((p) => ({ ...p, antibioticPainkillerReaction: opt }))}
                >
                  <Text style={[s.chipText, profile.antibioticPainkillerReaction === opt && s.chipTextOn]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.fieldLabel}>Chronic conditions — quick add</Text>
            <View style={s.row}>
              {CHRONIC_CHIPS.map((c) => (
                <TouchableOpacity key={c} style={s.chip} onPress={() => appendChronicChip(c)}>
                  <Text style={s.chipText}>+ {c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.input, s.area]}
              value={profile.chronicDiseasesText}
              onChangeText={(v) => setProfile((p) => ({ ...p, chronicDiseasesText: v }))}
              placeholder="Chronic diseases (diabetes, heart, kidney, asthma, …)"
              multiline
            />
            <TextInput
              style={[s.input, s.area]}
              value={profile.currentMedicationsText}
              onChangeText={(v) => setProfile((p) => ({ ...p, currentMedicationsText: v }))}
              placeholder="Current medicines (list all, including over-the-counter)"
              multiline
            />
            <TextInput
              style={s.input}
              value={profile.emergencyContact}
              onChangeText={(v) => setProfile((p) => ({ ...p, emergencyContact: v }))}
              placeholder="Emergency contact (name and phone)"
            />
            <TextInput
              style={s.input}
              value={profile.caregiverDetails}
              onChangeText={(v) => setProfile((p) => ({ ...p, caregiverDetails: v }))}
              placeholder="Caregiver (for alerts when a check is dangerous)"
            />
            <TouchableOpacity style={s.bigPrimary} onPress={saveProfile} disabled={saving}>
              <Text style={s.bigPrimaryText}>{saving ? 'Saving…' : 'Save and continue'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (route === 'onboarding') {
    const advance = () => {
      if (onboardingStep === 0) {
        if (!profile.age?.trim() || !profile.gender) {
          Alert.alert('Missing', 'Please enter age and gender.');
          return;
        }
        setOnboardingStep(1);
        return;
      }
      if (onboardingStep === 1) {
        if (profile.hasMedicineAllergy !== true && profile.hasMedicineAllergy !== false) {
          Alert.alert('Missing', 'Please answer Yes or No for medicine allergies.');
          return;
        }
        if (profile.hasMedicineAllergy === true && !profile.knownAllergiesText?.trim()) {
          Alert.alert('Missing', 'Please list known drug allergies or type “unsure”.');
          return;
        }
        setOnboardingStep(2);
        return;
      }
      if (onboardingStep === 2) {
        setOnboardingStep(3);
      }
    };
    return (
      <View style={s.screen}>
        {header('Set up your health profile', 'One-time setup. You can change this later from the home screen.')}
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.dots}>
            {[0, 1, 2, 3].map((i) => (
              <View key={String(i)} style={[s.dot, i === onboardingStep && s.dotOn]} />
            ))}
          </View>
          {onboardingStep === 0 ? (
            <>
              <View style={s.card}>
                <Text style={s.title}>About you</Text>
                <Text style={s.helpSmall}>We use this to tailor safety checks (for example older adult cautions).</Text>
              </View>
              <TextInput
                style={s.input}
                value={profile.age}
                onChangeText={(v) => setProfile((p) => ({ ...p, age: v }))}
                placeholder="Age"
                keyboardType="numeric"
              />
              <Text style={s.fieldLabel}>Gender</Text>
              <View style={s.row}>
                {['Male', 'Female', 'Other'].map((gender) => (
                  <TouchableOpacity key={gender} style={[s.chip, profile.gender === gender && s.chipOn]} onPress={() => setProfile((p) => ({ ...p, gender }))}>
                    <Text style={[s.chipText, profile.gender === gender && s.chipTextOn]}>{gender}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {pregnancyApplicable ? (
                <>
                  <Text style={s.fieldLabel}>Pregnancy (if relevant)</Text>
                  <View style={s.row}>
                    {PREGNANCY_OPTIONS.map((opt) => (
                      <TouchableOpacity key={opt} style={[s.chip, pregnancyNote === opt && s.chipOn]} onPress={() => setPregnancyNote(opt)}>
                        <Text style={[s.chipText, pregnancyNote === opt && s.chipTextOn]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}
          {onboardingStep === 1 ? (
            <>
              <View style={s.card}>
                <Text style={s.title}>Allergy history</Text>
                <Text style={s.helpSmall}>Saved once and reused every time you check a medicine.</Text>
              </View>
              <Text style={s.fieldLabel}>Have you ever had an allergic reaction to any medicine?</Text>
              <View style={s.row}>
                {[
                  { label: 'Yes', value: true },
                  { label: 'No', value: false },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[s.chip, profile.hasMedicineAllergy === item.value && s.chipOn]}
                    onPress={() => setProfile((p) => ({ ...p, hasMedicineAllergy: item.value }))}
                  >
                    <Text style={[s.chipText, profile.hasMedicineAllergy === item.value && s.chipTextOn]}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.helpSmall}>If you are not sure, choose Yes and explain in the boxes below.</Text>
              <Text style={s.fieldLabel}>Known drug allergies (names or “unsure”)</Text>
              <TextInput
                style={[s.input, s.area]}
                value={profile.knownAllergiesText}
                onChangeText={(v) => setProfile((p) => ({ ...p, knownAllergiesText: v }))}
                placeholder="e.g. Penicillin, or none"
                multiline
              />
              <Text style={s.fieldLabel}>What symptoms did you get? (if any)</Text>
              <TextInput
                style={[s.input, s.area]}
                value={profile.reactionSymptomsText}
                onChangeText={(v) => setProfile((p) => ({ ...p, reactionSymptomsText: v }))}
                placeholder="e.g. rash, swelling, breathing trouble"
                multiline
              />
              <Text style={s.fieldLabel}>Medicine names you suspect (if any)</Text>
              <TextInput
                style={s.input}
                value={profile.suspectedMedicineNamesText}
                onChangeText={(v) => setProfile((p) => ({ ...p, suspectedMedicineNamesText: v }))}
                placeholder="Optional"
              />
              <Text style={s.fieldLabel}>Has a doctor told you to avoid any medicines?</Text>
              <TextInput
                style={[s.input, s.area]}
                value={profile.avoidedMedicinesText}
                onChangeText={(v) => setProfile((p) => ({ ...p, avoidedMedicinesText: v }))}
                placeholder="List medicines or classes to avoid, or leave blank"
                multiline
              />
              <Text style={s.fieldLabel}>Reacted to antibiotics or painkillers before?</Text>
              <View style={s.row}>
                {['Yes', 'No', 'Not sure'].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[s.chip, profile.antibioticPainkillerReaction === opt && s.chipOn]}
                    onPress={() => setProfile((p) => ({ ...p, antibioticPainkillerReaction: opt }))}
                  >
                    <Text style={[s.chipText, profile.antibioticPainkillerReaction === opt && s.chipTextOn]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
          {onboardingStep === 2 ? (
            <>
              <View style={s.card}>
                <Text style={s.title}>Chronic conditions & medicines</Text>
              </View>
              <Text style={s.fieldLabel}>Chronic diseases — quick add</Text>
              <View style={s.row}>
                {CHRONIC_CHIPS.map((c) => (
                  <TouchableOpacity key={c} style={s.chip} onPress={() => appendChronicChip(c)}>
                    <Text style={s.chipText}>+ {c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[s.input, s.area]}
                value={profile.chronicDiseasesText}
                onChangeText={(v) => setProfile((p) => ({ ...p, chronicDiseasesText: v }))}
                placeholder="Describe chronic conditions, or type “none”"
                multiline
              />
              <Text style={s.fieldLabel}>What medicines are you taking now?</Text>
              <TextInput
                style={[s.input, s.area]}
                value={profile.currentMedicationsText}
                onChangeText={(v) => setProfile((p) => ({ ...p, currentMedicationsText: v }))}
                placeholder="Include prescriptions and over-the-counter. Type “none” if not taking any."
                multiline
              />
            </>
          ) : null}
          {onboardingStep === 3 ? (
            <>
              <View style={s.card}>
                <Text style={s.title}>Emergency & caregiver</Text>
              </View>
              <TextInput
                style={s.input}
                value={profile.emergencyContact}
                onChangeText={(v) => setProfile((p) => ({ ...p, emergencyContact: v }))}
                placeholder="Emergency contact (name and phone)"
              />
              <TextInput
                style={s.input}
                value={profile.caregiverDetails}
                onChangeText={(v) => setProfile((p) => ({ ...p, caregiverDetails: v }))}
                placeholder="Caregiver (optional)"
              />
            </>
          ) : null}
          {onboardingStep < 3 ? (
            <TouchableOpacity style={s.bigPrimary} onPress={advance}>
              <Text style={s.bigPrimaryText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.bigPrimary} onPress={completeOnboarding} disabled={saving}>
              <Text style={s.bigPrimaryText}>{saving ? 'Saving…' : 'Save & finish'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  if (route === 'check-input') {
    return (
      <View style={s.screen}>
        {header('Type medicine', 'Type the medicine name. Suggestions appear from the drug list.')}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Medicine name</Text>
            <TextInput
              style={s.input}
              value={medicineInput.medicineName}
              onChangeText={onMedicineNameChange}
              placeholder="Start typing… e.g. Panadol"
              placeholderTextColor={palette.textTertiary}
              autoCorrect={false}
            />
            {searchBusy ? <Text style={s.helpSmall}>Searching library…</Text> : null}
            <View style={s.suggestPanel}>
              <FlatList
                data={suggestions}
                keyExtractor={(item, index) => `${item.rxnormCui || item.displayName}-${index}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={s.suggestRow} onPress={() => pickSuggestion(item)} activeOpacity={0.7}>
                    <Text style={s.suggestTitle}>{item.displayName}</Text>
                    {item.ingredientName ? <Text style={s.suggestSub}>{item.ingredientName}</Text> : null}
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 220 }}
                ListEmptyComponent={
                  medicineInput.medicineName.length > 2 ? (
                    <Text style={s.suggestEmpty}>No matches in our list — you can still continue with what you typed.</Text>
                  ) : (
                    <Text style={s.suggestEmpty}>Type at least 3 letters to see suggestions.</Text>
                  )
                }
              />
            </View>
            <TouchableOpacity
              style={s.bigPrimary}
              onPress={() => {
                if (!medicineInput.medicineName.trim()) {
                  Alert.alert('Missing', 'Enter a medicine name.');
                  return;
                }
                setMedicineInput((m) => ({ ...m, inputMethod: 'manual' }));
                minimalReturnRoute.current = 'check-input';
                setMinimalCheck(emptyMinimal);
                setRoute('check-minimal');
              }}
            >
              <Text style={s.bigPrimaryText}>Next: quick check</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (route === 'confirm') {
    return (
      <View style={s.screen}>
        {header('Confirm medicine', 'Please confirm the medicine details before we analyse.')}
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.confirmCard}>
            <Text style={s.confirmLabel}>Medicine</Text>
            <Text style={s.confirmValue}>{medicineInput.medicineName}</Text>
            <View style={s.confirmDivider} />
            <Text style={s.confirmLabel}>Dose</Text>
            <Text style={s.confirmValue}>{medicineInput.dose || '—'}</Text>
            <View style={s.confirmDivider} />
            <Text style={s.confirmLabel}>How often</Text>
            <Text style={s.confirmValue}>{medicineInput.frequency || '—'}</Text>
            <Text style={s.helpSmall}>Names are matched to ingredients on the server when possible (e.g. brands → generic).</Text>
          </View>
          <View style={s.split}>
            <TouchableOpacity style={s.secondaryHalf} onPress={() => setRoute('medicine-hub')}>
              <Text style={s.secondaryText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.primaryHalf}
              onPress={() => {
                minimalReturnRoute.current = 'confirm';
                setMinimalCheck(emptyMinimal);
                setRoute('check-minimal');
              }}
            >
              <Text style={s.primaryText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (route === 'check-minimal') {
    return (
      <View style={s.screen}>
        {header('Quick update', 'Optional — your saved profile is already used. Add only what changed.')}
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.title}>Checking: {medicineInput.medicineName || 'Medicine'}</Text>
            <Text style={s.helpSmall}>
              We already use your allergy history, chronic conditions, and saved medicines. Answer below only if something is new since you last
              updated your profile.
            </Text>
          </View>
          {profile.currentMedicationsText?.trim() ? (
            <View style={s.disclaimerCard}>
              <Text style={s.disclaimerText}>Current medicines on file: {profile.currentMedicationsText.trim()}</Text>
            </View>
          ) : null}
          <Text style={s.fieldLabel}>Any new medicines not on your profile?</Text>
          <TextInput
            style={[s.input, s.area]}
            value={minimalCheck.newMedicinesNote}
            onChangeText={(v) => setMinimalCheck((m) => ({ ...m, newMedicinesNote: v }))}
            placeholder="Leave blank if nothing new"
            multiline
          />
          <Text style={s.fieldLabel}>Any new reaction recently?</Text>
          {[
            { label: 'Yes', value: true },
            { label: 'No', value: false },
            { label: 'Not sure', value: null },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[s.option, minimalCheck.recentReaction === item.value && s.optionOn]}
              onPress={() => setMinimalCheck((m) => ({ ...m, recentReaction: item.value }))}
            >
              <Text style={[s.optionText, minimalCheck.recentReaction === item.value && s.optionTextOn]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
          <Text style={s.fieldLabel}>If yes, what happened?</Text>
          <TextInput
            style={[s.input, s.area]}
            value={minimalCheck.recentReactionDetail}
            onChangeText={(v) => setMinimalCheck((m) => ({ ...m, recentReactionDetail: v }))}
            placeholder="Symptoms or notes (optional)"
            multiline
          />
          <TouchableOpacity style={s.bigPrimary} onPress={checkMedicine}>
            <Text style={s.bigPrimaryText}>Run safety check</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'profile-medicines') {
    return (
      <View style={s.screen}>
        {header('Update current medicines', 'Change your medicine list — used for interaction checks.')}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.lead}>List everything you take now, including over-the-counter drugs and supplements if you want them considered.</Text>
            <TextInput
              style={[s.input, s.areaLarge]}
              value={profile.currentMedicationsText}
              onChangeText={(v) => setProfile((p) => ({ ...p, currentMedicationsText: v }))}
              placeholder="Medicines"
              multiline
            />
            <TouchableOpacity style={s.bigPrimary} onPress={saveCurrentMedicinesOnly} disabled={saving}>
              <Text style={s.bigPrimaryText}>{saving ? 'Saving…' : 'Save medicines'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (route === 'reaction-log') {
    return (
      <View style={s.screen}>
        {header('Log a reaction', 'Record a reaction to a medicine for your history.')}
        <ScrollView contentContainerStyle={s.content}>
          <TextInput
            style={[s.input, s.area]}
            value={standaloneReaction.symptoms}
            onChangeText={(v) => setStandaloneReaction((r) => ({ ...r, symptoms: v }))}
            placeholder="What symptoms did you have?"
            multiline
          />
          <Text style={s.fieldLabel}>Severity</Text>
          <View style={s.row}>
            {['mild', 'moderate', 'severe'].map((level) => (
              <TouchableOpacity
                key={level}
                style={[s.chip, standaloneReaction.severity === level && s.chipOn]}
                onPress={() => setStandaloneReaction((r) => ({ ...r, severity: level }))}
              >
                <Text style={[s.chipText, standaloneReaction.severity === level && s.chipTextOn]}>{level}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[s.input, s.area]}
            value={standaloneReaction.notes}
            onChangeText={(v) => setStandaloneReaction((r) => ({ ...r, notes: v }))}
            placeholder="Medicine name or other notes"
            multiline
          />
          <TouchableOpacity style={s.bigPrimary} onPress={submitStandaloneReaction} disabled={saving}>
            <Text style={s.bigPrimaryText}>{saving ? 'Saving…' : 'Save reaction'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'result') {
    return (
      <View style={s.screen}>
        {header('Safety result', 'Here is your medicine safety result.')}
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {latestResult?.card ? resultBody(latestResult.card, latestResult.analysis) : null}
          <View style={s.disclaimerCard}>
            <Text style={s.disclaimerText}>Results depend on the information you entered and our knowledge base — not a substitute for professional care.</Text>
          </View>
          <Text style={s.sectionTitle}>After you take a medicine</Text>
          <TouchableOpacity style={s.tile} onPress={() => setRoute('follow-up')}>
            <Text style={s.tileTitle}>Follow-up: how did you feel?</Text>
            <Text style={s.tileSub}>Update your allergy profile after you use the medicine.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.bigPrimary} onPress={() => setRoute('history')}>
            <Text style={s.bigPrimaryText}>View history</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBig} onPress={() => setRoute('home')}>
            <Text style={s.secondaryBigText}>Medicine safety home</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBig} onPress={() => setRoute('medicine-hub')}>
            <Text style={s.secondaryBigText}>Check another medicine</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'follow-up') {
    return (
      <View style={s.screen}>
        {header('Follow-up', 'Tell us if you had any reaction after taking the medicine.')}
        <ScrollView contentContainerStyle={s.content}>
          <TextInput
            style={[s.input, s.area]}
            value={followUp.symptoms}
            onChangeText={(v) => setFollowUp((f) => ({ ...f, symptoms: v }))}
            placeholder="What did you feel?"
            multiline
          />
          <Text style={s.fieldLabel}>Severity</Text>
          <View style={s.row}>
            {['mild', 'moderate', 'severe'].map((level) => (
              <TouchableOpacity key={level} style={[s.chip, followUp.severity === level && s.chipOn]} onPress={() => setFollowUp((f) => ({ ...f, severity: level }))}>
                <Text style={[s.chipText, followUp.severity === level && s.chipTextOn]}>{level}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[s.input, s.area]} value={followUp.notes} onChangeText={(v) => setFollowUp((f) => ({ ...f, notes: v }))} placeholder="Notes" multiline />
          <TouchableOpacity style={s.bigPrimary} onPress={submitFollowUp} disabled={saving}>
            <Text style={s.bigPrimaryText}>{saving ? 'Saving…' : 'Save follow-up'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'history') {
    return (
      <View style={s.screen}>
        {header('Safety history', 'Your past medicine checks.')}
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={s.lead}>Each check is stored with your answers and the risk level from that day.</Text>
          {historyItems.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>No checks yet</Text>
              <Text style={s.emptySub}>When you run a medicine safety check, it will appear here so you can review it later.</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setRoute('medicine-hub')}>
                <Text style={s.emptyBtnText}>Check a medicine</Text>
              </TouchableOpacity>
            </View>
          ) : (
            historyItems.map((item) => (
              <TouchableOpacity
                key={`${item.id}-${item.createdAt}`}
                style={s.historyCard}
                onPress={() => {
                  setSelectedCard(
                    item.card || {
                      medicineName: item.medicineName,
                      riskLevel: item.riskLevel,
                      riskScore: item.riskScore,
                      explanation: item.card?.explanation || 'No detailed explanation saved.',
                      recommendation: item.card?.recommendation || 'No recommendation saved.',
                      maxInteractionSeverity: item.maxInteractionSeverity,
                      interactionCount: item.interactionCount,
                    }
                  );
                  setRoute('history-detail');
                }}
                activeOpacity={0.88}
              >
                <View style={s.historyCardMain}>
                  <Text style={s.historyMed}>{item.medicineName || 'Medicine'}</Text>
                  <Text style={s.historyDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <View style={[s.badge, tone(String(item.riskLevel || 'Warning')).box]}>
                  <Text style={[s.badgeText, tone(String(item.riskLevel || 'Warning')).text]}>{item.riskLevel || 'Saved'}</Text>
                </View>
                <Text style={s.historyChevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {header('Past result', 'Details from a saved check.')}
      <ScrollView contentContainerStyle={s.content}>{selectedCard ? resultBody(selectedCard, null) : null}</ScrollView>
    </View>
  );
}

const cardShadow = Platform.select({
  ios: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
  android: { elevation: 2 },
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  top: {
    backgroundColor: palette.header,
    paddingBottom: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  backText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  topTitleWrap: { flex: 1, paddingRight: 6 },
  topTitle: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 0.2 },
  speakTop: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakTopText: { fontSize: 20 },
  speakTopPlaceholder: { width: 44 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  loadTitle: { marginTop: 16, fontSize: 20, fontWeight: '700', color: palette.text, textAlign: 'center' },
  loadText: { marginTop: 10, fontSize: 16, color: palette.textSecondary, textAlign: 'center', lineHeight: 24, maxWidth: 300 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  moduleHero: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
    ...cardShadow,
  },
  moduleHeroTop: { flexDirection: 'row', alignItems: 'center' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  statusChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  statusChipText: { fontSize: 13, fontWeight: '700' },
  statusReady: { backgroundColor: palette.primaryMuted },
  statusReadyText: { color: palette.primary },
  statusPending: { backgroundColor: palette.warnBg },
  statusPendingText: { color: palette.warn },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  circleText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  heroTitle: { fontSize: 24, fontWeight: '700', color: palette.text },
  heroSub: { marginTop: 8, fontSize: 16, color: palette.textSecondary, lineHeight: 24 },
  disclaimerCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: palette.primary,
  },
  disclaimerText: { fontSize: 13, color: palette.textSecondary, lineHeight: 20 },
  bigPrimary: {
    backgroundColor: palette.primary,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginTop: 4,
    ...cardShadow,
  },
  ctaInner: { flexDirection: 'row', alignItems: 'center' },
  ctaIconBubble: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  ctaIcon: { fontSize: 26 },
  ctaTextCol: { flex: 1 },
  bigPrimaryText: { color: '#fff', fontSize: 19, fontWeight: '700' },
  bigPrimarySub: { color: 'rgba(255,255,255,0.9)', fontSize: 15, marginTop: 4 },
  primaryActionCard: { borderWidth: 0 },
  secondaryBig: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    ...cardShadow,
  },
  secondaryBigText: { color: palette.text, fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: palette.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 12 },
  shortcutRow: { flexDirection: 'row', justifyContent: 'space-between' },
  shortcutHalf: {
    width: '48%',
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    ...cardShadow,
  },
  shortcutIcon: { fontSize: 28, marginBottom: 10 },
  shortcutTitle: { fontSize: 17, fontWeight: '700', color: palette.text },
  shortcutSub: { fontSize: 13, color: palette.textSecondary, marginTop: 4, lineHeight: 18 },
  tile: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    marginBottom: 12,
    ...cardShadow,
  },
  tileTitle: { fontSize: 17, fontWeight: '700', color: palette.text },
  tileSub: { marginTop: 6, fontSize: 15, color: palette.textSecondary, lineHeight: 22 },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
    ...cardShadow,
  },
  hubIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  hubIconTeal: { backgroundColor: '#ccfbf1' },
  hubIconBlue: { backgroundColor: '#dbeafe' },
  hubIconViolet: { backgroundColor: '#ede9fe' },
  hubEmoji: { fontSize: 24 },
  hubRowBody: { flex: 1 },
  hubRowTitle: { fontSize: 17, fontWeight: '700', color: palette.text },
  hubRowSub: { fontSize: 14, color: palette.textSecondary, marginTop: 4 },
  hubChevron: { fontSize: 22, color: palette.textTertiary, fontWeight: '300' },
  lead: { fontSize: 16, color: palette.textSecondary, lineHeight: 24, marginBottom: 16 },
  profileTop: { alignItems: 'center', paddingBottom: 12 },
  bigCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  bigCircleText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  profileTitle: { marginTop: 14, fontSize: 22, fontWeight: '700', color: palette.text },
  profileMeta: { marginTop: 4, fontSize: 15, color: palette.textSecondary },
  small: { fontSize: 12, fontWeight: '700', color: palette.textTertiary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    marginBottom: 12,
    ...cardShadow,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: palette.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardText: { fontSize: 16, lineHeight: 24, color: palette.text, fontWeight: '500' },
  helpSmall: { fontSize: 14, color: palette.textSecondary, lineHeight: 20, marginTop: 8 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: palette.text, marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: palette.text,
    marginBottom: 12,
    minHeight: 52,
  },
  area: { minHeight: 100, textAlignVertical: 'top' },
  areaLarge: { minHeight: 160, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  chip: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
    marginRight: 8,
    marginBottom: 8,
    minHeight: 46,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 15, fontWeight: '600', color: palette.text },
  chipTextOn: { color: '#fff' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.borderStrong, marginHorizontal: 4 },
  dotOn: { width: 22, borderRadius: 4, backgroundColor: palette.primary },
  title: { fontSize: 19, lineHeight: 28, fontWeight: '700', color: palette.text },
  option: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
    minHeight: 52,
    justifyContent: 'center',
    ...cardShadow,
  },
  optionOn: { backgroundColor: palette.primaryMuted, borderColor: palette.primary, borderWidth: 2 },
  optionText: { fontSize: 16, fontWeight: '600', color: palette.text },
  optionTextOn: { color: palette.primary },
  suggestPanel: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 12,
    overflow: 'hidden',
    ...cardShadow,
  },
  suggestRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  suggestTitle: { fontSize: 16, fontWeight: '600', color: palette.text },
  suggestSub: { fontSize: 14, color: palette.textSecondary, marginTop: 4 },
  suggestEmpty: { padding: 16, fontSize: 14, color: palette.textSecondary, lineHeight: 20 },
  confirmCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
    ...cardShadow,
  },
  confirmLabel: { fontSize: 12, fontWeight: '700', color: palette.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6 },
  confirmValue: { fontSize: 18, fontWeight: '600', color: palette.text, marginTop: 4 },
  confirmDivider: { height: 1, backgroundColor: palette.border, marginVertical: 14 },
  split: { flexDirection: 'row', marginTop: 8 },
  secondaryHalf: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginRight: 6,
  },
  primaryHalf: {
    flex: 1,
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginLeft: 6,
  },
  secondaryText: { color: palette.text, fontSize: 16, fontWeight: '600' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resultMedLabel: { fontSize: 12, fontWeight: '700', color: palette.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8 },
  med: { fontSize: 26, fontWeight: '700', color: palette.text, marginTop: 6, marginBottom: 16 },
  banner: { borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  bannerWarn: { backgroundColor: palette.warnBg },
  bannerSafe: { backgroundColor: palette.safeBg },
  bannerDanger: { backgroundColor: palette.dangerBg },
  riskPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  pillSafe: { backgroundColor: '#99f6e4' },
  pillSafeText: { color: '#0f766e', fontSize: 13, fontWeight: '800' },
  pillWarn: { backgroundColor: '#fde68a' },
  pillWarnText: { color: '#b45309', fontSize: 13, fontWeight: '800' },
  pillDanger: { backgroundColor: '#fecaca' },
  pillDangerText: { color: palette.danger, fontSize: 13, fontWeight: '800' },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: palette.text },
  bannerSub: { fontSize: 14, marginTop: 4, lineHeight: 20, color: palette.textSecondary },
  emergencyBanner: {
    backgroundColor: palette.dangerBg,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  emergencyTitle: { fontSize: 17, fontWeight: '700', color: palette.danger },
  emergencyText: { marginTop: 8, fontSize: 15, color: palette.text, lineHeight: 24 },
  caregiverNote: { marginTop: 10, fontSize: 14, color: palette.textSecondary, lineHeight: 22 },
  scoreBlock: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 18,
    marginBottom: 12,
    ...cardShadow,
  },
  scoreBlockTitle: { fontSize: 14, fontWeight: '700', color: palette.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreLine: { fontSize: 15, color: palette.text, marginTop: 4, fontWeight: '500' },
  scoreHint: { fontSize: 13, color: palette.textSecondary, marginTop: 10, lineHeight: 20 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  scoreLabel: { fontSize: 14, color: palette.textSecondary, fontWeight: '600', marginRight: 10 },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: palette.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: palette.primary, borderRadius: 5 },
  scoreValue: { marginLeft: 10, fontSize: 15, fontWeight: '700', color: palette.text },
  interactionCard: {
    backgroundColor: palette.warnBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 18,
    marginBottom: 12,
  },
  interactionTitle: { fontSize: 16, fontWeight: '700', color: palette.warn },
  interactionLevel: { marginTop: 8, fontSize: 16, fontWeight: '600', color: palette.text },
  warn: { backgroundColor: palette.warnBg },
  warnText: { color: palette.warn },
  safe: { backgroundColor: palette.safeBg },
  safeText: { color: palette.safe },
  danger: { backgroundColor: palette.dangerBg },
  dangerText: { color: palette.danger },
  bullet: { fontSize: 15, lineHeight: 24, fontWeight: '500', marginTop: 4, color: palette.text },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: palette.border,
    ...cardShadow,
  },
  historyCardMain: { flex: 1, paddingRight: 8 },
  historyMed: { fontSize: 17, fontWeight: '700', color: palette.text },
  historyDate: { fontSize: 14, color: palette.textSecondary, marginTop: 4 },
  historyChevron: { fontSize: 22, color: palette.textTertiary, marginLeft: 4 },
  emptyState: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    ...cardShadow,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: palette.text },
  emptySub: { fontSize: 15, color: palette.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 22 },
  emptyBtn: { marginTop: 20, backgroundColor: palette.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 0, alignSelf: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800' },
});
