import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
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
import { getBackendConnectionHelp } from '../services/apiConfig';
import { authService } from '../services/authService';
import {
  cleanExplanationText,
  extractMedicineFromText,
  interactionSeverityUserLabel,
  mergeChronicWithPregnancy,
  parsePregnancyFromChronic,
} from '../utils/medicineFlowUtils';
import {
  getExpoImagePicker,
  getExpoSpeech,
  getExpoSpeechRecognitionModule,
} from '../utils/optionalExpoModules';
import {
  profileComplete,
  validateClinicalOverride,
  validateMedicineCheckForm,
  validateOnboardingStep,
  validateProfileForm,
  validateReactionForm,
} from '../utils/formValidation';
import { elder, palette } from '../theme/elderTheme';

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
  caregiverEmail: '',
  caregiverPhone: '',
  profileCompleted: false,
  reactionSymptomsText: '',
  suspectedMedicineNamesText: '',
  avoidedMedicinesText: '',
  antibioticPainkillerReaction: '',
  feedbackConsentForTraining: false,
};

const REACTION_OUTCOMES = ['none', 'mild', 'moderate', 'severe', 'anaphylactic'];

const emptyInput = {
  inputMethod: 'manual',
  medicineName: '',
  normalizedDrugName: '',
  dose: '',
  frequency: '',
  rawOcrText: '',
  ocrSourceLine: '',
  spokenText: '',
};

const emptyMinimal = {
  newMedicinesNote: '',
  recentReaction: null,
  recentReactionDetail: '',
};

const emptyScanQuality = {
  status: 'unknown',
  warnings: [],
  blurScore: 0,
  contrastScore: 0,
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

const questionnaireComplete = (answers) => QUESTIONS.every((item) => Boolean(answers[item.key]));

const isOnboardedUser = (profile, answers) =>
  profile.profileCompleted === true || (questionnaireComplete(answers) && profileComplete(profile));

const errorText = (e, fallback) => {
  if (e?.response?.data?.error) {
    return e.response.data.error;
  }

  if (e?.message === 'Network Error') {
    return getBackendConnectionHelp();
  }

  return e?.message || fallback;
};
const formatDate = (v) => {
  if (!v) return 'No date';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
};

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toTimestamp = (value) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const getScoreSnapshot = (card, analysis = null) => {
  const ml = analysis?.mlPrediction || analysis?.medicationKnowledge?.mlPrediction || card?.medicationKnowledge?.mlPrediction || null;
  const dataUsed = analysis?.dataUsed || card?.dataUsed || {};
  const ruleScore = toFiniteNumber(dataUsed.ruleScore);
  const rawMlScore =
    toFiniteNumber(dataUsed.rawMlScore) ??
    toFiniteNumber(card?.medicationKnowledge?.mlPrediction?.rawMlRiskScore) ??
    toFiniteNumber(ml?.rawMlRiskScore);
  const adjustedMlScore =
    toFiniteNumber(dataUsed.adjustedMlScore) ??
    toFiniteNumber(dataUsed.mlScore) ??
    toFiniteNumber(card?.medicationKnowledge?.mlPrediction?.adjustedMlRiskScore) ??
    toFiniteNumber(card?.medicationKnowledge?.mlPrediction?.mlRiskScore) ??
    toFiniteNumber(ml?.adjustedMlRiskScore) ??
    toFiniteNumber(ml?.mlRiskScore);
  const finalScore = toFiniteNumber(analysis?.riskScore) ?? toFiniteNumber(card?.riskScore);
  const mlScoreWasCapped = Boolean(
    dataUsed.mlScoreWasCapped ??
      card?.medicationKnowledge?.mlPrediction?.mlScoreWasCapped ??
      ml?.mlScoreWasCapped
  );

  return {
    ml,
    dataUsed,
    ruleScore,
    rawMlScore,
    adjustedMlScore,
    finalScore,
    mlScoreWasCapped,
  };
};

const formatPercentFromProbability = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${(numeric * 100).toFixed(1)}%`;
};

const getMlSeriousProbability = (ml) => {
  if (!ml) return null;
  const candidates = [
    ml.adrRiskProbability,
    ml.probabilityDangerous,
    ml.probability,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
};

const getMlThreshold = (ml, dataUsed) => {
  const directThreshold = Number(ml?.threshold);
  if (Number.isFinite(directThreshold)) return directThreshold;

  const youdenThreshold = Number(dataUsed?.hybridBreakdown?.youdensJThreshold?.optimal_threshold);
  if (Number.isFinite(youdenThreshold)) return youdenThreshold;

  return 0.55;
};

const findBestCardForHistoryItem = (historyItem, cards = []) => {
  const historyName = String(historyItem?.normalizedDrugName || historyItem?.medicineName || '').trim().toLowerCase();
  const historyRxnorm = String(historyItem?.rxnormCui || '').trim();
  const historyRiskLevel = String(historyItem?.riskLevel || '').trim().toLowerCase();
  const historyRiskScore = toFiniteNumber(historyItem?.riskScore);
  const historyCreatedAt = toTimestamp(historyItem?.createdAt);

  const candidates = (Array.isArray(cards) ? cards : []).filter((card) => {
    const cardName = String(card?.normalizedDrugName || card?.medicineName || '').trim().toLowerCase();
    const cardRxnorm = String(card?.rxnormCui || '').trim();
    return (historyRxnorm && cardRxnorm === historyRxnorm) || (historyName && cardName === historyName);
  });

  if (!candidates.length) {
    return null;
  }

  return candidates
    .map((card) => {
      const cardName = String(card?.normalizedDrugName || card?.medicineName || '').trim().toLowerCase();
      const cardRxnorm = String(card?.rxnormCui || '').trim();
      const cardRiskLevel = String(card?.riskLevel || '').trim().toLowerCase();
      const cardRiskScore = toFiniteNumber(card?.riskScore);
      const cardUpdatedAt = toTimestamp(card?.updatedAt || card?.createdAt);
      let matchScore = 0;

      if (historyRxnorm && cardRxnorm === historyRxnorm) matchScore += 8;
      if (historyName && cardName === historyName) matchScore += 6;
      if (historyRiskLevel && cardRiskLevel === historyRiskLevel) matchScore += 3;
      if (historyRiskScore != null && cardRiskScore != null && historyRiskScore === cardRiskScore) matchScore += 3;

      return {
        card,
        matchScore,
        timeDistance:
          historyCreatedAt != null && cardUpdatedAt != null
            ? Math.abs(cardUpdatedAt - historyCreatedAt)
            : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((left, right) => right.matchScore - left.matchScore || left.timeDistance - right.timeDistance)[0]?.card || null;
};

const buildHistoryScoreSummary = (historyItem, matchedCard) => {
  const scoreSnapshot = matchedCard ? getScoreSnapshot(matchedCard, null) : null;
  const mlScore = scoreSnapshot?.adjustedMlScore ?? scoreSnapshot?.rawMlScore ?? null;
  const finalScore = scoreSnapshot?.finalScore ?? toFiniteNumber(historyItem?.riskScore);
  const parts = [];

  if (mlScore != null) {
    parts.push(`ML ${mlScore}/100`);
  }
  if (finalScore != null) {
    parts.push(`Final ${finalScore}/100`);
  }

  return parts.join(' · ');
};

/** One-line label for confirm step, e.g. "Amoxicillin 500 mg twice daily (tds)". */
function formatParsedMedicineLine(parsed) {
  if (!parsed) return '';
  const name = String(parsed.medicineName || '').trim();
  const dose = String(parsed.dose || '').trim();
  const freq = String(parsed.displayFrequency || parsed.frequency || '').trim();
  const parts = [name];
  if (dose) parts.push(dose);
  if (freq) parts.push(freq);
  return parts.join(' ').trim();
}

function formatScanCandidateLine(candidate) {
  if (!candidate) return '';
  const fromFields = formatParsedMedicineLine({
    medicineName: candidate.medicineName,
    dose: candidate.dose,
    displayFrequency: candidate.displayFrequency,
    frequency: candidate.frequency,
  });
  if (fromFields) return fromFields;
  return String(candidate.sourceLine || '').trim();
}

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
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [scanRawText, setScanRawText] = useState('');
  const [scanMatchedCandidates, setScanMatchedCandidates] = useState([]);
  const [scanQuality, setScanQuality] = useState(emptyScanQuality);
  const [selectedScanCandidateIndex, setSelectedScanCandidateIndex] = useState(0);
  const [scanConfirmMedicineDraft, setScanConfirmMedicineDraft] = useState('');
  const [voiceDraft, setVoiceDraft] = useState('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceDiagnostic, setVoiceDiagnostic] = useState('');
  const [scanFlashOn, setScanFlashOn] = useState(false);
  const [followUp, setFollowUp] = useState({ symptoms: '', severity: 'none', notes: '', pharmacistConfirmed: false });
  const [standaloneReaction, setStandaloneReaction] = useState({ symptoms: '', severity: 'mild', notes: '', pharmacistConfirmed: false });
  const [clinicalOverride, setClinicalOverride] = useState({ accepted: false, justification: '', pharmacistConfirmed: false });
  const [showResultDetails, setShowResultDetails] = useState(false);
  const dangerAlertShown = useRef(false);
  const searchTimer = useRef(null);
  const routeBootstrapped = useRef(false);
  const minimalReturnRoute = useRef('check-input');
  const voiceListenerRefs = useRef([]);
  const imagePickerLockRef = useRef(false);
  const scanCameraAutoOpenedRef = useRef(false);

  useEffect(() => {
    authService.getStoredUser().then((u) => {
      const name = u?.fullName || u?.name || '';
      setUserFirstName(name.split(/\s+/)[0] || '');
    });
  }, []);

  useEffect(() => {
    if (route === 'result') setShowResultDetails(false);
  }, [route, latestResult?.card?.medicineName, latestResult?.card?.riskScore]);

  useEffect(() => {
    return () => {
      voiceListenerRefs.current.forEach((sub) => {
        try {
          sub?.remove?.();
        } catch {
          // Ignore listener cleanup issues.
        }
      });
      voiceListenerRefs.current = [];
    };
  }, []);

  useEffect(() => {
    if (route !== 'voice-input' && isVoiceListening) {
      stopVoiceRecognition();
    }
  }, [route, isVoiceListening]);

  useEffect(() => {
    if (route === 'scan-capture') {
      // Don't auto-open camera - let user click button instead
      scanCameraAutoOpenedRef.current = true;
      return undefined;
    }

    scanCameraAutoOpenedRef.current = false;
    return undefined;
  }, [route]);

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
          feedbackConsentForTraining: Boolean(p.feedbackConsentForTraining),
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
    Alert.alert(
      'Important safety alert',
      'This result is dangerous. Do not take this medicine until a doctor says it is safe.',
      [{ text: 'I understand' }]
    );
  }, [route, latestResult]);

  const historyItems = useMemo(
    () =>
      history.map((item) => ({
        ...item,
        card: findBestCardForHistoryItem(item, cards),
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
  const speechRecognitionAvailable = useMemo(() => Boolean(getExpoSpeechRecognitionModule()), []);

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
    setMedicineInput((m) => ({ ...m, medicineName: v, normalizedDrugName: '', inputMethod: 'manual' }));
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
    const validation = validateProfileForm(profile);
    if (!validation.valid) {
      Alert.alert('Validation', validation.message);
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
    const validation = validateProfileForm(profile);
    if (!validation.valid) {
      Alert.alert('Validation', validation.message);
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
    const validation = validateMedicineCheckForm({
      medicineName: medicineInput.medicineName,
      recentReaction: minimalCheck.recentReaction,
      recentReactionDetail: minimalCheck.recentReactionDetail,
    });
    if (!validation.valid) {
      Alert.alert('Validation', validation.message);
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
        normalizedDrugName: medicineInput.normalizedDrugName || '',
      });
      setLatestResult(result);
      setCards((prev) => [result.card, ...prev.filter((item) => item.id !== result.card.id)]);
      setHistory(await allergyService.getHistory());
      setSelectedCard(result.card);
      setMedicineInput(emptyInput);
      setMinimalCheck(emptyMinimal);
      setClinicalOverride({ accepted: false, justification: '', pharmacistConfirmed: false });
      dangerAlertShown.current = false;
      setRoute('result');
    } catch (e) {
      if (e?.response?.data?.code === 'MEDICINE_NOT_RECOGNIZED') {
        const backendSuggestions = Array.isArray(e?.response?.data?.details?.suggestions)
          ? e.response.data.details.suggestions
          : [];
        if (backendSuggestions.length) {
          setSuggestions(backendSuggestions);
        }
        Alert.alert(
          'Medicine not recognized',
          e?.response?.data?.error ||
            'We could not reliably identify this medicine. Please check the spelling, choose a suggested medicine, scan the prescription, or try again.'
        );
        setRoute('check-minimal');
        return;
      }
      Alert.alert('Check failed', errorText(e, 'Could not check medicine safety.'));
      setRoute('check-minimal');
    }
  };

  const submitStandaloneReaction = async () => {
    const validation = validateReactionForm({
      symptoms: standaloneReaction.symptoms,
      severity: standaloneReaction.severity,
    });
    if (!validation.valid) {
      Alert.alert('Validation', validation.message);
      return;
    }
    try {
      setSaving(true);
      await allergyService.saveReaction({
        medicineCheckId: null,
        symptoms: standaloneReaction.severity === 'none' ? 'No reaction reported' : standaloneReaction.symptoms,
        severity: standaloneReaction.severity,
        notes: standaloneReaction.notes || '',
        pharmacistConfirmed: standaloneReaction.pharmacistConfirmed,
        pharmacistRole: standaloneReaction.pharmacistConfirmed ? 'pharmacist' : '',
      });
      setReactions(await allergyService.getReactions().catch(() => []));
      Alert.alert('Saved', 'Reaction logged. It will be kept with your allergy history.');
      setStandaloneReaction({ symptoms: '', severity: 'mild', notes: '', pharmacistConfirmed: false });
      setRoute('home');
    } catch (e) {
      Alert.alert('Save failed', errorText(e, 'Could not save reaction.'));
    } finally {
      setSaving(false);
    }
  };

  const submitFollowUp = async () => {
    const validation = validateReactionForm({
      symptoms: followUp.symptoms,
      severity: followUp.severity,
    });
    if (!validation.valid) {
      Alert.alert('Validation', validation.message);
      return;
    }
    try {
      setSaving(true);
      await allergyService.saveReaction({
        medicineCheckId: null,
        allergyCardId: latestResult?.card?.id || null,
        symptoms: followUp.severity === 'none' ? 'No reaction reported' : followUp.symptoms,
        severity: followUp.severity,
        notes: [followUp.notes, latestResult?.card?.id ? `Related check card id: ${latestResult.card.id}` : ''].filter(Boolean).join('\n'),
        pharmacistConfirmed: followUp.pharmacistConfirmed,
        pharmacistRole: followUp.pharmacistConfirmed ? 'pharmacist' : '',
      });
      Alert.alert('Thank you', 'Your follow-up was saved. Future checks can use this information.');
      setFollowUp({ symptoms: '', severity: 'none', notes: '', pharmacistConfirmed: false });
      setRoute('home');
    } catch (e) {
      Alert.alert('Save failed', errorText(e, 'Could not save follow-up.'));
    } finally {
      setSaving(false);
    }
  };

  const documentClinicalOverride = async () => {
    const overrideValidation = validateClinicalOverride(clinicalOverride.justification);
    if (!overrideValidation.valid) {
      Alert.alert('Validation', overrideValidation.message);
      return;
    }
    try {
      setSaving(true);
      await allergyService.saveClinicalOverride({
        allergyCardId: latestResult?.card?.id || null,
        medicineName: latestResult?.card?.medicineName || '',
        riskLevel: latestResult?.card?.riskLevel || 'Dangerous',
        justification: clinicalOverride.justification.trim(),
        pharmacistConfirmed: clinicalOverride.pharmacistConfirmed,
        pharmacistRole: clinicalOverride.pharmacistConfirmed ? 'pharmacist' : 'clinician',
      });
      setClinicalOverride((prev) => ({ ...prev, accepted: true }));
      Alert.alert('Override documented', 'Clinical override recorded for this check. Proceed only as directed by your clinician.');
    } catch (e) {
      Alert.alert('Save failed', errorText(e, 'Could not save clinical override record.'));
    } finally {
      setSaving(false);
    }
  };

  const withImagePickerLock = async (fn) => {
    if (imagePickerLockRef.current) return null;
    imagePickerLockRef.current = true;
    try {
      await new Promise((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      return await fn();
    } finally {
      setTimeout(() => {
        imagePickerLockRef.current = false;
      }, 500);
    }
  };

  const runOcrOnPickedImage = async (uri, mimeType) => {
    setScanRawText('');
    setScanMatchedCandidates([]);
    setScanQuality(emptyScanQuality);
    setOcrConfidence(0);
    setSelectedScanCandidateIndex(0);
    setOcrPhase(1);
    setRoute('scan-process');
    const phaseTimer = setTimeout(() => setOcrPhase(2), 1500);
    try {
      const { rawText, confidence, message, preprocessing, quality, matchedCandidates } = await extractPrescriptionTextFromImage(uri, mimeType);
      const resolvedCandidates = Array.isArray(matchedCandidates) ? matchedCandidates : [];
      setScanRawText(rawText);
      setScanMatchedCandidates(resolvedCandidates);
      setScanQuality({
        ...emptyScanQuality,
        ...(quality || {}),
        warnings: Array.isArray(quality?.warnings) ? quality.warnings : [],
      });
      setOcrConfidence(confidence);
      setOcrPhase(3);
      if (Array.isArray(preprocessing?.applied) && preprocessing.applied.length > 0) {
        Alert.alert(
          'OCR preprocessing applied',
          `Image steps: ${preprocessing.applied.join(', ')}. Please review and correct extracted text before continuing.`
        );
      }
      if (Array.isArray(quality?.warnings) && quality.warnings.length > 0) {
        Alert.alert('Scan quality warning', quality.warnings.join('\n'));
      }
      if (!String(rawText || '').trim() && message) {
        Alert.alert('No text found', `${message} You can type the prescription below.`);
      }

      const primaryCandidate = resolvedCandidates[0];
      const guessedLine =
        (primaryCandidate?.medicineName?.trim() ? formatScanCandidateLine(primaryCandidate) : '') ||
        formatParsedMedicineLine(extractMedicineFromText(String(rawText || '').trim()));
      if (guessedLine.trim()) {
        setSelectedScanCandidateIndex(0);
        setScanConfirmMedicineDraft(guessedLine);
        setRoute('scan-medicine-confirm');
        return;
      }
    } catch (e) {
      const status = e?.response?.status;
      let serverMsg = errorText(e, 'Could not reach the server or process the image.');
      const followUp = ' You can type or paste the prescription text on the next screen.';
      if (status === 400) {
        serverMsg = e?.response?.data?.error || 'The selected file could not be uploaded as an image.';
        Alert.alert('Upload failed', `${serverMsg}${followUp}`);
      } else if (status === 401) {
        Alert.alert(
          'Session issue',
          `Sign in with the live server (not offline mode) so your session is valid, then try again.${followUp}`
        );
      } else if (status === 413) {
        Alert.alert('Image too large', `Choose a smaller prescription photo.${followUp}`);
      } else if (status === 422) {
        serverMsg = e?.response?.data?.error || 'The photo is too blurry for reliable OCR.';
        Alert.alert('Retake photo', `${serverMsg}${followUp}`);
      } else if (status === 500) {
        serverMsg = e?.response?.data?.error || 'The server could not finish OCR for this image.';
        Alert.alert('OCR failed on server', `${serverMsg}${followUp}`);
      } else {
        Alert.alert('Cannot reach OCR service', `${serverMsg}${followUp}`);
      }
      setScanRawText('');
      setScanMatchedCandidates([]);
      setScanQuality(emptyScanQuality);
    } finally {
      clearTimeout(phaseTimer);
      setRoute((currentRoute) =>
        currentRoute === 'confirm' || currentRoute === 'scan-medicine-confirm' ? currentRoute : 'scan-text'
      );
    }
  };

  const startGalleryScanFlow = async () => {
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
      picked = await withImagePickerLock(async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Please allow photo access to scan a prescription image.');
          return { canceled: true };
        }
        return ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.85,
          allowsEditing: true,
        });
      });
    } catch (e) {
      const msg = errorText(e, '');
      if (/Already resumed|resumeWith/i.test(msg)) {
        Alert.alert('Photo picker closed unexpectedly', 'Try choosing the photo again.');
        return;
      }
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
    if (!picked || picked.canceled) return;
    const asset = picked.assets?.[0];
    const uri = asset?.uri;
    if (!uri) {
      Alert.alert('No image', 'Could not read the selected photo. Try another image.');
      return;
    }
    await runOcrOnPickedImage(uri, asset.mimeType || 'image/jpeg');
  };

  const startCameraScanFlow = async (options = {}) => {
    const { preferFlash = false } = options;
    const ImagePicker = getExpoImagePicker();
    if (!ImagePicker?.launchCameraAsync) {
      Alert.alert('Camera unavailable', 'Rebuild the app with expo-image-picker, or upload from the gallery instead.');
      return;
    }
    let picked;
    try {
      picked = await withImagePickerLock(async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permission needed', 'Please allow camera access to photograph a prescription.');
          return { canceled: true };
        }
        if (preferFlash) {
          Alert.alert(
            'Flash control',
            'This build opens your phone camera app for capture. Turn on flash there if needed, then take the photo.'
          );
        }
        return ImagePicker.launchCameraAsync({
          quality: 0.85,
          allowsEditing: true,
        });
      });
    } catch (e) {
      const msg = errorText(e, '');
      if (/Already resumed|resumeWith/i.test(msg)) {
        Alert.alert('Camera closed unexpectedly', 'Try taking the photo again.');
        return;
      }
      Alert.alert('Could not use camera', errorText(e, 'Try the gallery option or enter text manually.'));
      return;
    }
    if (!picked || picked.canceled) return;
    const asset = picked.assets?.[0];
    const uri = asset?.uri;
    if (!uri) {
      Alert.alert('No image', 'Could not read the photo. Try again.');
      return;
    }
    await runOcrOnPickedImage(uri, asset.mimeType || 'image/jpeg');
  };

  const applyParsedPrescription = () => {
    const candidates = scanMatchedCandidates;
    const selectedCandidate =
      candidates[selectedScanCandidateIndex] ||
      candidates[0] || {
        ...extractMedicineFromText(scanRawText),
        sourceLine: scanRawText.split('\n')[0]?.trim() || '',
      };
    const draft =
      formatScanCandidateLine(selectedCandidate) ||
      formatParsedMedicineLine(extractMedicineFromText(scanRawText)) ||
      scanRawText.split('\n')[0]?.trim() ||
      '';
    if (!draft.trim()) {
      Alert.alert('No medicine found', 'Edit the prescription text so the medicine name is clear, then try again.');
      return;
    }
    setScanConfirmMedicineDraft(draft);
    setRoute('scan-medicine-confirm');
  };

  const confirmScanMedicineAndContinue = () => {
    const line = scanConfirmMedicineDraft.trim();
    if (!line) {
      Alert.alert('Missing', 'Enter or confirm the medicine name.');
      return;
    }
    const parsed = extractMedicineFromText(line);
    const resolvedName = parsed.medicineName || line.split('\n')[0]?.trim() || '';
    if (!resolvedName.trim()) {
      Alert.alert('Missing', 'Could not read a medicine name. Edit the text and try again.');
      return;
    }
    setMedicineInput({
      inputMethod: 'scan',
      medicineName: resolvedName,
      normalizedDrugName: selectedCandidate.normalizedDrugName || '',
      dose: parsed.dose || '',
      frequency: parsed.displayFrequency || parsed.frequency || '',
      rawOcrText: scanRawText,
      ocrSourceLine: line,
      spokenText: '',
    });
    minimalReturnRoute.current = 'scan-medicine-confirm';
    setMinimalCheck(emptyMinimal);
    setRoute('check-minimal');
  };

  const startVoiceFlow = () => {
    setVoiceDraft('');
    setIsVoiceListening(false);
    setVoiceError('');
    setVoiceDiagnostic(speechRecognitionAvailable ? '' : 'Native voice module not loaded — keyboard mic still works below.');
    setRoute('voice-input');
    setTimeout(() => {
      speakAloud('Say the medicine name clearly after tapping start microphone.');
    }, 400);
  };

  const stopVoiceRecognition = async () => {
    const SpeechRecognition = getExpoSpeechRecognitionModule();
    if (!SpeechRecognition) {
      setIsVoiceListening(false);
      return;
    }
    try {
      await SpeechRecognition.stop();
    } catch {
      // no-op
    }
    setIsVoiceListening(false);
  };

  const startVoiceRecognition = async () => {
    setVoiceError('');
    setVoiceDiagnostic('');

    const SpeechRecognition = getExpoSpeechRecognitionModule();
    if (!SpeechRecognition) {
      setVoiceError(
        'Voice module not available in this build. Rebuild the dev client (npx expo prebuild + npm run android) so expo-speech-recognition is included, or use the keyboard microphone in the text box below.'
      );
      return;
    }

    const subscribe =
      typeof SpeechRecognition.addSpeechRecognitionListener === 'function'
        ? SpeechRecognition.addSpeechRecognitionListener
        : SpeechRecognition.addListener?.bind(SpeechRecognition);
    if (typeof subscribe !== 'function') {
      setVoiceError('Voice listener API is unavailable in this build of expo-speech-recognition.');
      return;
    }

    if (voiceListenerRefs.current.length === 0) {
      const resultSub = subscribe('result', (event) => {
        const phrase = event?.results?.[0]?.transcript || '';
        if (phrase) {
          setVoiceDraft(phrase);
        }
      });
      const startSub = subscribe('start', () => {
        setIsVoiceListening(true);
        setVoiceDiagnostic('Listening — speak the medicine name clearly.');
      });
      const speechStartSub = subscribe('speechstart', () => {
        setVoiceDiagnostic('We hear you — keep speaking…');
      });
      const endSub = subscribe('end', () => setIsVoiceListening(false));
      const errorSub = subscribe('error', (event) => {
        const code = event?.error || 'unknown';
        const message = event?.message || '';
        setIsVoiceListening(false);
        const friendly =
          code === 'not-allowed'
            ? 'Microphone or speech permission denied. Allow it in app settings and try again.'
            : code === 'no-speech' || code === 'speech-timeout'
              ? 'No speech was detected. Tap the microphone and speak the medicine name.'
              : code === 'network'
                ? 'Network error during recognition. Check your internet connection.'
                : code === 'service-not-allowed'
                  ? 'Speech recognizer is not available on this device. Install / enable Google app, or use the keyboard mic.'
                  : code === 'language-not-supported'
                    ? 'English (en-US) is not supported by this recognizer.'
                    : code === 'audio-capture'
                      ? 'Could not access the microphone. Close other apps using the mic and retry.'
                      : `Voice error: ${code}${message ? ` — ${message}` : ''}`;
        setVoiceError(friendly);
      });
      voiceListenerRefs.current = [resultSub, startSub, speechStartSub, endSub, errorSub];
    }

    try {
      const permission = await SpeechRecognition.requestPermissionsAsync();
      if (!permission?.granted) {
        setVoiceError('Microphone / speech recognition permission was not granted. Open settings and allow it for ElderMeds.');
        return;
      }

      if (Platform.OS === 'android' && typeof SpeechRecognition.getSpeechRecognitionServices === 'function') {
        try {
          const services = SpeechRecognition.getSpeechRecognitionServices();
          if (Array.isArray(services) && services.length === 0) {
            setVoiceError(
              'No speech recognition service is installed on this device. Install or enable the Google app (com.google.android.googlequicksearchbox), or use the keyboard mic in the text box below.'
            );
            return;
          }
          if (Array.isArray(services) && services.length) {
            setVoiceDiagnostic(`Using recognizer: ${services[0]}`);
          }
        } catch {
          // ignore — services lookup is informational only
        }
      }

      setIsVoiceListening(true);
      setVoiceDiagnostic('Starting microphone…');
      await SpeechRecognition.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
      });
    } catch (e) {
      setIsVoiceListening(false);
      setVoiceError(errorText(e, 'Could not start voice recognition.'));
    }
  };

  const confirmVoice = () => {
    const spokenText = voiceDraft.trim();
    if (!spokenText) {
      Alert.alert('Missing name', 'Please speak the medicine name first.');
      return;
    }
    const parsed = extractMedicineFromText(spokenText);
    setMedicineInput({
      inputMethod: 'voice',
      medicineName: parsed.medicineName || spokenText,
      normalizedDrugName: '',
      dose: parsed.dose,
      frequency: parsed.displayFrequency || parsed.frequency,
      rawOcrText: '',
      spokenText,
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
          sub: 'Do not take this medicine until you speak with your doctor.',
          barFill: palette.danger,
        }
      : risk === 'Safe'
        ? {
            box: s.safe,
            text: s.safeText,
            banner: s.bannerSafe,
            pill: s.pillSafe,
            pillText: s.pillSafeText,
            sub: 'This check looks OK for you. Still follow your doctor’s advice.',
            barFill: palette.safe,
          }
        : {
            box: s.warn,
            text: s.warnText,
            banner: s.bannerWarn,
            pill: s.pillWarn,
            pillText: s.pillWarnText,
            sub: 'Please check with your pharmacist or doctor before taking this.',
            barFill: palette.warn,
        };

  const confirmBackRoute =
    medicineInput.inputMethod === 'voice'
      ? 'voice-input'
      : medicineInput.inputMethod === 'scan'
        ? 'scan-text'
        : 'check-input';

  const displaySideEffects = (effects = [], limit = 6) => (Array.isArray(effects) ? effects.filter(Boolean).slice(0, limit) : []);
  const displayInteractions = (items = [], limit = 5) => (Array.isArray(items) ? items.filter(Boolean).slice(0, limit) : []);

  const resultBody = (card, analysis = null) => {
    if (!card) return null;
    const report = analysis?.riskReport || analysis?.dataUsed?.riskReport || card?.dataUsed?.riskReport || null;
    const t = tone(String(card.riskLevel || 'Warning'));
    const {
      ml,
      dataUsed,
      ruleScore,
      rawMlScore,
      adjustedMlScore,
      finalScore,
      mlScoreWasCapped,
    } = getScoreSnapshot(card, analysis);
    const mlScore = adjustedMlScore;
    const hasMlBlend = Boolean(dataUsed.mlEnabled || ml?.available || rawMlScore != null || adjustedMlScore != null);
    const sev = interactionSeverityUserLabel(card.maxInteractionSeverity || analysis?.medicationKnowledge?.interactions?.[0]?.severity);
    const mk = analysis?.medicationKnowledge || card?.medicationKnowledge || {};
    const interactions = displayInteractions(report?.drugInteractions?.length ? report.drugInteractions : mk.interactions);
    const triggeredRules = report?.triggeredRules?.length
      ? report.triggeredRules
      : (card.riskFactors || analysis?.riskFactors || []).map((factor) => ({
          ...factor,
          recommendation: factor.recommendation || 'Discuss this finding with a pharmacist or doctor.',
        }));
    const allergyConflicts = report?.allergyConflicts || null;
    const alternatives = report?.alternativeSuggestions || [];
    const shapItems = (report?.shap?.contributions || ml?.shap?.contributions || []).slice(0, 8);
    const shapMax = shapItems.reduce((max, item) => Math.max(max, Math.abs(Number(item.shap || 0))), 0.0001);
    const clinicalAction = report?.classification?.clinicalAction || t.sub;
    const requiresOverride = report?.safetyControls?.requiresClinicalOverride && !clinicalOverride.accepted;
    const guidelines = report?.clinicalRecommendations?.general?.length
      ? report.clinicalRecommendations.general
      : analysis?.guidelines || card.guidelines || [];
    const mlSeriousProbability = getMlSeriousProbability(ml);
    const mlThreshold = getMlThreshold(ml, dataUsed);
    const allergyEvidenceMatches = Array.isArray(dataUsed?.allergyEvidenceMatches) ? dataUsed.allergyEvidenceMatches : [];

    return (
      <>
        <Text style={s.resultMedLabel}>Medicine checked</Text>
        <Text style={s.med}>{card.medicineName || 'Medicine'}</Text>
        <View style={[s.banner, t.banner]}>
          <View style={[s.riskPill, t.pill]}>
            <Text style={[s.riskPillText, t.pillText]}>
              {card.riskLevel || 'Warning'}
            </Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.bannerTitle}>What this means for you</Text>
            <Text style={[s.bannerSub, t.text]}>{clinicalAction}</Text>
          </View>
        </View>

        {requiresOverride ? (
          <View style={s.blockBanner}>
            <Text style={s.blockTitle}>This medicine is blocked for now</Text>
            <Text style={s.blockText}>
              Your doctor or carer must approve this before you take it. Write the reason below.
            </Text>
            <TextInput
              style={[s.input, s.area, { marginTop: 10 }]}
              value={clinicalOverride.justification}
              onChangeText={(value) => setClinicalOverride((prev) => ({ ...prev, justification: value, accepted: false }))}
              placeholder="e.g. Doctor approved this with monitoring"
              placeholderTextColor={palette.placeholder}
              multiline
            />
            <TouchableOpacity
              style={[s.bigPrimary, { marginTop: 12 }]}
              onPress={documentClinicalOverride}
              disabled={saving}
            >
              <Text style={s.bigPrimaryText}>Save doctor’s approval</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.row, { marginTop: 10, alignItems: 'center' }]}
              onPress={() => setClinicalOverride((prev) => ({ ...prev, pharmacistConfirmed: !prev.pharmacistConfirmed }))}
            >
              <Text style={s.chipText}>{clinicalOverride.pharmacistConfirmed ? '☑' : '☐'} Pharmacist confirmed</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {card.riskLevel === 'Dangerous' ? (
          <View style={s.emergencyBanner}>
            <Text style={s.emergencyTitle}>If you feel unwell</Text>
            <Text style={s.emergencyText}>
              Call your doctor or go to urgent care if you already took this medicine and feel worse. If breathing is hard or swelling is
              severe, call emergency services straight away.
            </Text>
          </View>
        ) : null}

        <View style={s.elderScoreSimple}>
          {hasMlBlend && mlSeriousProbability != null ? (
            <Text style={s.elderScoreHint}>
              ML serious-event probability: {formatPercentFromProbability(mlSeriousProbability)}
              {mlThreshold != null ? ` · threshold ${mlThreshold}` : ''}
            </Text>
          ) : null}
          <Text style={s.elderScoreTitle}>Safety score: {finalScore ?? '--'} out of 100</Text>
          <Text style={s.elderScoreHint}>0–19 Safe · 20–54 Warning · 55+ Dangerous</Text>
          <View style={[s.scoreRow, { marginTop: 14, marginBottom: 0 }]}>
            <View style={[s.track, s.trackLarge]}>
              <View style={[s.fill, s.fillLarge, { width: `${Math.max(8, Number(finalScore || 0))}%`, backgroundColor: t.barFill }]} />
            </View>
            <Text style={s.scoreValueLarge}>{finalScore ?? '--'}</Text>
          </View>
        </View>

        {(ruleScore != null || rawMlScore != null || adjustedMlScore != null || finalScore != null) ? (
          <View style={s.scoreBlock}>
            <Text style={s.scoreBlockTitle}>Score breakdown</Text>
            {ruleScore != null ? <Text style={s.scoreLine}>Clinical rule score: {ruleScore} / 100</Text> : null}
            {mlSeriousProbability != null ? (
              <Text style={s.scoreLine}>ML serious-event probability: {formatPercentFromProbability(mlSeriousProbability)}</Text>
            ) : null}
            {mlThreshold != null ? <Text style={s.scoreLine}>ML threshold used: {mlThreshold}</Text> : null}
            {rawMlScore != null ? <Text style={s.scoreLine}>Raw ML score: {rawMlScore} / 100</Text> : null}
            {adjustedMlScore != null ? <Text style={s.scoreLine}>Adjusted ML score: {adjustedMlScore} / 100</Text> : null}
            {finalScore != null ? <Text style={s.scoreLine}>{hasMlBlend ? 'Final hybrid score' : 'Final clinical score'}: {finalScore} / 100</Text> : null}
            {hasMlBlend && dataUsed.hybridBreakdown ? (
              <Text style={s.scoreHint}>
                Formula: {dataUsed.hybridBreakdown.formula || '0.6 x rule + 0.4 x ML'} -> blended {dataUsed.hybridBreakdown.blendedScore ?? finalScore}/100
              </Text>
            ) : null}
            {mlScoreWasCapped && rawMlScore != null && adjustedMlScore != null ? (
              <Text style={s.scoreHint}>
                Hybrid guardrail applied: raw ML score {rawMlScore}/100 was reduced to {adjustedMlScore}/100 before blending.
              </Text>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity
          style={s.detailsToggle}
          onPress={() => setShowResultDetails((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={showResultDetails ? 'Hide technical details' : 'Show technical details'}
        >
          <Text style={s.detailsToggleText}>
            {showResultDetails ? '▲ Hide technical details' : '▼ Show technical details (for doctors or carers)'}
          </Text>
        </TouchableOpacity>

        {showResultDetails ? (
          <>
        <View style={s.scoreBlock}>
          <Text style={s.scoreBlockTitle}>How we calculated this</Text>
          <Text style={s.scoreLine}>Final score: {finalScore ?? '--'} / 100</Text>
          <Text style={s.scoreHint}>Levels: 0–19 Safe · 20–54 Warning · 55–100 Dangerous</Text>
          {ruleScore != null ? <Text style={s.scoreLine}>Rule-based clinical score: {ruleScore} / 100</Text> : null}
          {hasMlBlend && mlScore != null ? (
            <Text style={s.scoreLine}>ML score — P(Dangerous) × 100: {mlScore} / 100</Text>
          ) : null}
          {hasMlBlend && rawMlScore != null ? (
            <Text style={s.scoreLine}>Raw ML score - calibrated P(ADR) x 100: {rawMlScore} / 100</Text>
          ) : null}
          {hasMlBlend && adjustedMlScore != null ? (
            <Text style={s.scoreLine}>Adjusted ML score used in hybrid blend: {adjustedMlScore} / 100</Text>
          ) : null}
          {mlScoreWasCapped && rawMlScore != null && adjustedMlScore != null ? (
            <Text style={s.scoreHint}>
              Hybrid guardrail applied: raw ML score {rawMlScore}/100 was capped to {adjustedMlScore}/100 because rule evidence was weak.
            </Text>
          ) : null}
          {hasMlBlend && dataUsed.hybridBreakdown?.youdensJThreshold?.optimal_threshold != null ? (
            <Text style={s.scoreHint}>
              ML class threshold (Youden's J): P(ADR) ≥ {Number(dataUsed.hybridBreakdown.youdensJThreshold.optimal_threshold).toFixed(3)}
            </Text>
          ) : null}
          <Text style={s.scoreHint}>
            {hasMlBlend
              ? 'Final blend: 60% clinical rules + 40% ML P(Dangerous) (RTAD-MSM hybrid formula), with safety guardrails.'
              : 'This check used the clinical rule score only because no ML score was available.'}
          </Text>
          {hasMlBlend && dataUsed.hybridBreakdown ? (
            <Text style={s.scoreHint}>
              Formula: {dataUsed.hybridBreakdown.formula || '0.6×rule + 0.4×ML'} → blended {dataUsed.hybridBreakdown.blendedScore ?? finalScore}/100
            </Text>
          ) : null}
          {report?.scoreBreakdown?.formula ? (
            <Text style={s.scoreHint}>{report.scoreBreakdown.formula}</Text>
          ) : null}
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
          <Text style={s.scoreLabel}>Score bar</Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.max(8, Number(finalScore || 0))}%`, backgroundColor: t.barFill }]} />
          </View>
          <Text style={s.scoreValue}>{finalScore ?? '--'}/100</Text>
        </View>

        {triggeredRules.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Triggered rules and reasons</Text>
            {triggeredRules.map((rule, index) => (
              <View key={`${rule.factorType || 'rule'}-${index}`} style={s.ruleRow}>
                <Text style={s.ruleLabel}>{rule.factorLabel}</Text>
                <Text style={s.helpSmall}>
                  Score contribution: {rule.score ?? 0} · Severity: {rule.severity || 'n/a'}
                </Text>
                {rule.recommendation ? <Text style={s.ruleRecommendation}>{rule.recommendation}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {allergyEvidenceMatches.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Allergy evidence we matched</Text>
            {allergyEvidenceMatches.map((match, index) => (
              <View key={`${match.sourceKey || 'evidence'}-${index}`} style={s.ruleRow}>
                <Text style={s.ruleLabel}>{match.label || match.sourceKey || 'Profile evidence'}</Text>
                <Text style={s.helpSmall}>
                  Matched terms: {Array.isArray(match.matchedTerms) && match.matchedTerms.length ? match.matchedTerms.join(', ') : 'None'}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {shapItems.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>ML feature importance (SHAP)</Text>
            <Text style={s.helpSmall}>
              Top drivers of ADR risk probability{report?.shap?.method ? ` (${report.shap.method})` : ''}.
            </Text>
            {shapItems.map((item, index) => {
              const widthPct = Math.max(6, Math.round((Math.abs(Number(item.shap || 0)) / shapMax) * 100));
              const label = item.clinicalExplanation || item.feature;
              return (
                <View key={`shap-${item.feature}-${index}`} style={{ marginTop: 10 }}>
                  <Text style={s.shapFeature}>{label}</Text>
                  {!item.clinicalExplanation ? (
                    <Text style={s.helpSmall}>Feature: {item.feature}</Text>
                  ) : null}
                  <View style={s.shapTrack}>
                    <View
                      style={[
                        s.shapFill,
                        {
                          width: `${widthPct}%`,
                          backgroundColor: Number(item.shap || 0) >= 0 ? palette.danger : palette.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={s.helpSmall}>
                    Impact: {Number(item.shap || 0).toFixed(4)}
                    {item.waterfallCumulative != null ? ` · cumulative: ${Number(item.waterfallCumulative).toFixed(4)}` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
          </>
        ) : null}

        {allergyConflicts &&
        (allergyConflicts.directAllergyMatch ||
          allergyConflicts.classAllergyMatch ||
          allergyConflicts.nsaidAspirinCrossReactivity ||
          allergyConflicts.summary) ? (
          <View style={[s.card, s.danger]}>
            <Text style={[s.cardTitle, s.dangerText]}>Allergy warning</Text>
            {allergyConflicts.summary ? <Text style={s.cardText}>{allergyConflicts.summary}</Text> : null}
            {allergyConflicts.profileAllergiesText ? (
              <Text style={s.helpSmall}>Profile allergies: {allergyConflicts.profileAllergiesText}</Text>
            ) : null}
            <Text style={s.helpSmall}>
              Drug class: {allergyConflicts.drugClass || 'unknown'}
              {allergyConflicts.atcCode ? ` · ATC: ${allergyConflicts.atcCode}` : ''}
              {allergyConflicts.atcClassLabel ? ` · ${allergyConflicts.atcClassLabel}` : ''}
            </Text>
          </View>
        ) : null}

        {Number(card.interactionCount) > 0 ? (
          <View style={s.interactionCard}>
            <Text style={s.interactionTitle}>May not mix well with your other medicines</Text>
            <Text style={s.interactionLevel}>
              Highest concern level: {sev}
            </Text>
            <Text style={s.helpSmall}>Ask your pharmacist before taking this with your other tablets.</Text>
          </View>
        ) : null}

        <View style={s.card}>
          <Text style={s.cardTitle}>Why you got this result</Text>
          <Text style={s.cardText}>{cleanExplanationText(card.explanation)}</Text>
        </View>

        <View style={[s.card, t.box]}>
          <Text style={[s.cardTitle, t.text]}>What to do next</Text>
          <Text style={[s.cardText, t.text]}>{card.recommendation || 'No recommendation available.'}</Text>
        </View>

        {mk.ingredientName ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>About this medicine</Text>
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

        {showResultDetails && ml?.available ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Computer model check</Text>
            <Text style={s.cardText}>Support score: {ml.mlRiskScore ?? '--'} / 100 ({ml.mlRiskLevel || 'n/a'})</Text>
            <Text style={s.helpSmall}>This supports the main check — it does not replace your doctor.</Text>
          </View>
        ) : null}

        {interactions.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Other medicine interactions</Text>
            {interactions.map((item, index) => (
              <View key={`${item.interactingDrug || index}`} style={{ marginBottom: 10 }}>
                <Text style={s.bullet}>{`\u2022 ${item.interactingDrug || item.interactingNormalizedDrug || 'Another medicine'} (${interactionSeverityUserLabel(item.severity)})`}</Text>
                {item.description ? <Text style={s.helpSmall}>{item.description}</Text> : null}
                <Text style={s.helpSmall}>Source: {item.evidenceSource || 'DDInter'}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {alternatives.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Alternative suggestions</Text>
            {alternatives.map((item, index) => (
              <Text key={`alt-${index}`} style={s.bullet}>{`\u2022 ${item}`}</Text>
            ))}
            <Text style={s.helpSmall}>Suggestions are informational only — prescriber must confirm suitability.</Text>
          </View>
        ) : null}

        {guidelines.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Tips from clinical guidelines</Text>
            {guidelines.map((item, index) => (
              <Text key={`guide-${index}`} style={s.bullet}>{`\u2022 ${item}`}</Text>
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
                  if (route === 'scan-capture' || route === 'scan-text' || route === 'scan-process') setRoute('medicine-hub');
                  else if (route === 'scan-medicine-confirm') setRoute('scan-text');
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
          <TouchableOpacity style={s.speakTop} onPress={() => speakAloud(readText)} accessibilityLabel="Read screen aloud" accessibilityHint="Reads the main content on this screen">
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
          <Text style={s.loadTitle}>Checking your medicine…</Text>
          <Text style={s.loadText}>We are checking your allergies, health profile, and medicine information. This may take a moment.</Text>
        </View>
      </View>
    );
  }

  if (route === 'home') {
    const profileReadyChip = profile.profileCompleted === true || profileComplete(profile);
    const allergyHistoryChip = questionnaireComplete(answers);
    const readHome = `Medicine safety. ${
      isOnboarded
        ? 'Your health profile is saved. Tap check a medicine to start.'
        : 'Finish one-time setup so we can check medicines for you.'
    }`;
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
                <Text style={s.heroSub}>Check if a medicine is safe for you — using your allergies, health conditions, and current tablets.</Text>
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
              This app helps you decide — it does not replace your doctor or pharmacist. Always follow their advice.
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
                <Text style={s.bigPrimarySub}>{isOnboarded ? 'Type, take a photo, or speak the name' : 'Quick setup first, then check'}</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryBig} onPress={() => speakAloud(readHome)} activeOpacity={0.85}>
            <Text style={s.secondaryBigText}>🔊 Read this screen aloud</Text>
          </TouchableOpacity>

          <Text style={s.sectionTitle}>Quick links</Text>
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
    const hubRead = 'Choose how to enter the medicine. Type the name, upload or photograph a prescription for OCR, or speak the medicine name.';
    return (
      <View style={s.screen}>
        {header('Enter medicine', hubRead)}
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={s.lead}>Pick one way to tell us the medicine name. You can fix anything before we check.</Text>
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
          <TouchableOpacity style={s.hubRow} onPress={() => setRoute('scan-capture')} activeOpacity={0.88}>
            <View style={[s.hubIcon, s.hubIconBlue]}>
              <Text style={s.hubEmoji}>📄</Text>
            </View>
            <View style={s.hubRowBody}>
              <Text style={s.hubRowTitle}>Prescription scan</Text>
              <Text style={s.hubRowSub}>Open camera-style scan page for gallery or live capture</Text>
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

  if (route === 'scan-capture') {
    return (
      <View style={s.scanCaptureScreen}>
        <StatusBar barStyle="dark-content" backgroundColor="#f7f7fb" />
        <View style={[s.scanCaptureTop, { paddingTop: headerPadTop }]}>
          <TouchableOpacity style={s.scanCaptureBack} onPress={() => setRoute('medicine-hub')} activeOpacity={0.86}>
            <Text style={s.scanCaptureBackText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.scanCaptureTitle}>Prescription Scan</Text>
          <TouchableOpacity
            style={s.scanCaptureInfo}
            activeOpacity={0.86}
            onPress={() =>
              Alert.alert(
                'Prescription scan tips',
                'After taking or choosing the photo, crop it to only the medicine-name area. Keep the text clear and avoid shadows.'
              )
            }
          >
            <Text style={s.scanCaptureInfoText}>i</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scanCaptureContent} showsVerticalScrollIndicator={false}>
          <View style={s.scanFlowRow}>
            <View style={s.scanFlowStep}>
              <Text style={s.scanFlowStepNumber}>1</Text>
              <Text style={s.scanFlowStepLabel}>Capture</Text>
            </View>
            <View style={[s.scanFlowStep, s.scanFlowStepActive]}>
              <Text style={[s.scanFlowStepNumber, s.scanFlowStepNumberActive]}>2</Text>
              <Text style={[s.scanFlowStepLabel, s.scanFlowStepLabelActive]}>Read</Text>
            </View>
            <View style={s.scanFlowStep}>
              <Text style={s.scanFlowStepNumber}>3</Text>
              <Text style={s.scanFlowStepLabel}>Confirm</Text>
            </View>
          </View>
          <View style={s.scanIntroCard}>
            <View style={s.scanIntroIconWrap}>
              <Text style={s.scanIntroIcon}>🧾</Text>
            </View>
            <View style={s.scanIntroBody}>
              <Text style={s.scanIntroTitle}>Scan Prescription</Text>
              <Text style={s.scanIntroText}>Take or choose a prescription photo, then crop it to only the medicine area before OCR starts.</Text>
            </View>
          </View>

          <View style={s.scanHighlightCard}>
            <View style={s.scanHighlightBadge}>
              <Text style={s.scanHighlightBadgeText}>Best results</Text>
            </View>
            <Text style={s.scanHighlightTitle}>One clean photo is enough</Text>
            <Text style={s.scanHighlightText}>
              Crop tightly around the medicine lines you want to scan, and make sure that area is bright, flat, and readable.
            </Text>
          </View>

          <View style={s.scanPreviewShell}>
            <View style={s.scanPreviewCornerTl} />
            <View style={s.scanPreviewCornerTr} />
            <View style={s.scanPreviewCornerBl} />
            <View style={s.scanPreviewCornerBr} />
            <View style={s.scanPreviewGridVerticalLeft} />
            <View style={s.scanPreviewGridVerticalRight} />
            <View style={s.scanPreviewGridHorizontalTop} />
            <View style={s.scanPreviewGridHorizontalBottom} />

            <View style={s.scanLiveFrame}>
              <View style={s.scanLiveFrameInner}>
                <Text style={s.scanLiveFrameEyebrow}>Live camera opens automatically</Text>
                <Text style={s.scanLiveFrameTitle}>Capture clearly, then crop to the medicine area</Text>
                <Text style={s.scanLiveFrameText}>
                  Hold the phone above the page, keep medicine lines flat, then use the crop step to remove logos, signatures, and extra blank space.
                </Text>
              </View>
              <View style={s.scanLiveFrameFooter}>
                <View style={s.scanLiveHintChip}>
                  <Text style={s.scanLiveHintChipText}>Crop to medicines</Text>
                </View>
                <View style={s.scanLiveHintChip}>
                  <Text style={s.scanLiveHintChipText}>Good lighting</Text>
                </View>
                <View style={s.scanLiveHintChip}>
                  <Text style={s.scanLiveHintChipText}>No blur</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={s.scanTipsCard}>
            <Text style={s.scanTipsTitle}>Tips:</Text>
            <Text style={s.scanTipsBullet}>Crop to only the medicine-name section after capture</Text>
            <Text style={s.scanTipsBullet}>• Ensure the text is clear and the lighting is good</Text>
            <Text style={s.scanTipsBullet}>• Avoid shadows and blurry images</Text>
            <Text style={s.scanTipsBullet}>Keep each medicine line fully visible whenever possible</Text>
          </View>

          <View style={s.scanCaptureActions}>
            <TouchableOpacity style={s.scanSideAction} onPress={startGalleryScanFlow} activeOpacity={0.88}>
              <View style={[s.scanSideActionIcon, s.scanSideActionIconGallery]}>
                <Text style={s.scanSideActionIconText}>🖼️</Text>
              </View>
              <Text style={s.scanSideActionLabel}>Gallery</Text>
              <Text style={s.scanSideActionMeta}>Choose and crop image</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.scanCaptureButton} onPress={() => startCameraScanFlow({ preferFlash: scanFlashOn })} activeOpacity={0.9}>
              <View style={s.scanCaptureButtonInner}>
                <Text style={s.scanCaptureButtonIcon}>📷</Text>
              </View>
              <Text style={s.scanCaptureButtonLabel}>Take photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.scanSideAction}
              onPress={() => {
                setScanFlashOn(true);
                startCameraScanFlow({ preferFlash: true });
              }}
              activeOpacity={0.88}
            >
              <View style={[s.scanSideActionIcon, s.scanSideActionIconFlash, scanFlashOn ? s.scanSideActionIconActive : null]}>
                <Text style={s.scanSideActionIconText}>🔦</Text>
              </View>
              <Text style={s.scanSideActionLabel}>{scanFlashOn ? 'Flash Ready' : 'Flash'}</Text>
              <Text style={s.scanSideActionMeta}>Helpful in dim light</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.scanCaptureHint}>Take or choose a photo, then crop to the medicine area</Text>
        </ScrollView>
      </View>
    );
  }

  if (route === 'scan-process') {
    const labels = ['', 'Sending photo securely…', 'Extracting text (OCR)…', 'Almost done…'];
    const currentPhase = Math.min(Math.max(ocrPhase, 1), 3);
    const phaseNotes = [
      'Uploading your image to the ElderMeds server.',
      'Reading printed and handwritten text from the photo.',
      'Preparing the editable prescription draft for your review.',
    ];
    return (
      <View style={s.screen}>
        {header('Reading prescription', 'We are processing your prescription photo.')}
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.scanHero}>
            <View style={s.scanHeroBadge}>
              <Text style={s.scanHeroBadgeText}>Prescription OCR</Text>
            </View>
            <View style={s.scanHeroTop}>
              <View style={s.scanOrb}>
                <Text style={s.scanOrbIcon}>OCR</Text>
              </View>
              <View style={s.scanHeroTextWrap}>
                <Text style={s.scanEyebrow}>OCR scan in progress</Text>
                <Text style={s.scanTitle}>Reading your prescription photo</Text>
                <Text style={s.scanSubtitle}>
                  We extract the text first, then you review it before any medicine safety analysis runs.
                </Text>
              </View>
            </View>
            <View style={s.scanProgressTrack}>
              {[1, 2, 3].map((step) => (
                <View key={step} style={[s.scanProgressStep, currentPhase >= step ? s.scanProgressStepOn : null]} />
              ))}
            </View>
            <Text style={s.scanPhaseLabel}>{labels[ocrPhase] || 'Preparing…'}</Text>
            <Text style={s.scanPhaseHint}>{phaseNotes[Math.max(currentPhase - 1, 0)]}</Text>
          </View>

          <View style={s.scanLoadCard}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={s.loadTitle}>Processing image…</Text>
            <Text style={s.loadText}>
              The server is running OCR on the uploaded image. Handwritten prescriptions can take a little longer.
            </Text>
            <View style={s.scanStepRail}>
              {labels.slice(1).map((label, index) => {
                const step = index + 1;
                const active = currentPhase >= step;
                return (
                  <View key={label} style={[s.scanStepPill, active ? s.scanStepPillOn : null]}>
                    <Text style={[s.scanStepPillText, active ? s.scanStepPillTextOn : null]}>
                      {step}. {label.replace('…', '')}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={s.scanChecklist}>
            <Text style={s.scanChecklistTitle}>What happens next</Text>
            <View style={s.scanChecklistRow}>
              <Text style={s.scanChecklistBullet}>1</Text>
              <Text style={s.scanChecklistText}>We check image quality, then extract prescription text from the photo.</Text>
            </View>
            <View style={s.scanChecklistRow}>
              <Text style={s.scanChecklistBullet}>2</Text>
              <Text style={s.scanChecklistText}>You review and correct the detected text if needed.</Text>
            </View>
            <View style={s.scanChecklistRow}>
              <Text style={s.scanChecklistBullet}>3</Text>
              <Text style={s.scanChecklistText}>You confirm the medicine name in one box, then run the safety check.</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (route === 'scan-medicine-confirm') {
    const confirmRead =
      'We combined OCR with medicine-library matching. Confirm the corrected medicine name before the safety check.';
    return (
      <View style={s.screen}>
        {header('Confirm medicine', confirmRead)}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={s.card}>
              <Text style={s.fieldLabel}>Detected medicine name</Text>
              <TextInput
                style={s.input}
                value={scanConfirmMedicineDraft}
                onChangeText={setScanConfirmMedicineDraft}
                placeholder="e.g. Amoxicillin 500 mg"
                placeholderTextColor={palette.placeholder}
                autoCorrect={false}
                autoCapitalize="words"
              />
              <Text style={s.helpSmall}>Please confirm the corrected medicine name before checking safety.</Text>
            </View>
            {scanMatchedCandidates.length > 0 ? (
              <View style={s.scanExampleCard}>
                <Text style={s.scanInfoTitle}>Suggested medicine names</Text>
                <Text style={s.helpSmall}>Tap a suggestion from your medicine library if the draft above is not correct.</Text>
                {scanMatchedCandidates.map((candidate, index) => {
                  const selected = scanConfirmMedicineDraft.trim().toLowerCase() === String(candidate.medicineName || '').trim().toLowerCase();
                  return (
                    <TouchableOpacity
                      key={`${candidate.normalizedDrugName}-${candidate.sourceLine}-${index}`}
                      style={[s.option, selected ? s.optionOn : null]}
                      onPress={() => setScanConfirmMedicineDraft(candidate.medicineName || '')}
                      activeOpacity={0.86}
                    >
                      <Text style={[s.optionText, selected ? s.optionTextOn : null]}>{candidate.medicineName}</Text>
                      <Text style={s.helpSmall}>
                        {candidate.confidence === 'medium' && candidate.ocrFragment
                          ? `OCR read "${candidate.ocrFragment}" - corrected to ${candidate.medicineName}`
                          : `Matched from medicine library${candidate.matchedAlias ? ` via ${candidate.matchedAlias}` : ''}`}
                      </Text>
                      <Text style={s.helpSmall}>{candidate.sourceLine}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            <TouchableOpacity style={s.bigPrimary} onPress={confirmScanMedicineAndContinue} activeOpacity={0.88}>
              <Text style={s.bigPrimaryText}>Confirm medicine</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.secondaryBig, { marginTop: 12 }]} onPress={() => setRoute('scan-text')} activeOpacity={0.88}>
              <Text style={s.secondaryBigText}>Edit full prescription text</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (route === 'scan-text') {
    const trimmedScanText = scanRawText.trim();
    const scanCandidates = scanMatchedCandidates;
    const activeScanCandidateIndex =
      scanCandidates.length > 0 && selectedScanCandidateIndex < scanCandidates.length ? selectedScanCandidateIndex : 0;
    const confidenceTone = ocrConfidence >= 80 ? 'Strong' : ocrConfidence >= 55 ? 'Fair' : ocrConfidence > 0 ? 'Needs review' : 'Unknown';
    const qualityTone =
      scanQuality.status === 'good' ? 'Clear photo' : scanQuality.status === 'fair' ? 'Usable photo' : scanQuality.status === 'poor' ? 'Weak photo' : 'Unknown quality';
    const scanLineCount = trimmedScanText ? trimmedScanText.split(/\r?\n/).filter(Boolean).length : 0;
    const scanWordCount = trimmedScanText ? trimmedScanText.split(/\s+/).filter(Boolean).length : 0;
    const estimatedMedicineCount = trimmedScanText
      ? trimmedScanText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean).length
      : 0;
    const scanStatus = trimmedScanText ? 'Ready to guess' : 'Waiting for text';
    return (
      <View style={s.screen}>
        {header('Prescription text', 'Review the OCR text, then choose a corrected medicine name from the medicine library.')}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
          >
            <View style={s.scanEditorHero}>
              <View style={s.scanHeroBadge}>
                <Text style={s.scanHeroBadgeText}>Review OCR result</Text>
              </View>
              <Text style={s.scanEyebrow}>Review before checking</Text>
              <Text style={s.scanEditorTitle}>Clean up the extracted prescription text</Text>
              <Text style={s.scanEditorSub}>
                OCR may misread handwriting or abbreviations. Edit anything that looks wrong, then let the app guess the medicine name again.
              </Text>
              <View style={s.scanReviewBanner}>
                <View style={s.scanReviewStat}>
                  <Text style={s.scanReviewStatValue}>{ocrConfidence || '--'}</Text>
                  <Text style={s.scanReviewStatLabel}>OCR confidence</Text>
                </View>
                <View style={s.scanReviewDivider} />
                <View style={s.scanReviewBody}>
                  <Text style={s.scanReviewTitle}>{confidenceTone}</Text>
                  <Text style={s.scanReviewText}>
                    {ocrConfidence >= 80
                      ? 'This looks readable. Confirm medicine names before running the safety check.'
                      : ocrConfidence >= 55
                        ? 'Readable, but review strengths and abbreviations carefully.'
                        : 'This scan needs a careful review. Retake the image if key medicine names look wrong.'}
                  </Text>
                  <Text style={s.helpSmall}>
                    Photo quality: {qualityTone}
                    {scanQuality.blurScore ? ` | Blur score ${scanQuality.blurScore}` : ''}
                    {scanQuality.contrastScore ? ` | Contrast ${scanQuality.contrastScore}` : ''}
                  </Text>
                  {Array.isArray(scanQuality.warnings) && scanQuality.warnings.length > 0 ? (
                    <Text style={s.helpSmall}>{scanQuality.warnings.join(' ')}</Text>
                  ) : null}
                </View>
              </View>
              <View style={s.scanMetaRow}>
                <View style={[s.scanMetaChip, s.scanMetaChipTight]}>
                  <Text style={s.scanMetaValue}>{scanLineCount}</Text>
                  <Text style={s.scanMetaLabel}>Lines</Text>
                </View>
                <View style={[s.scanMetaChip, s.scanMetaChipTight]}>
                  <Text style={s.scanMetaValue}>{scanWordCount}</Text>
                  <Text style={s.scanMetaLabel}>Words</Text>
                </View>
                <View style={s.scanMetaChip}>
                  <Text style={s.scanMetaValue}>{trimmedScanText ? 'Ready' : 'Empty'}</Text>
                  <Text style={s.scanMetaLabel}>Status</Text>
                </View>
              </View>
              <View style={s.scanRescanRow}>
                <TouchableOpacity style={s.scanMiniAction} onPress={startGalleryScanFlow} activeOpacity={0.86}>
                  <Text style={s.scanMiniActionTitle}>Choose photo</Text>
                  <Text style={s.scanMiniActionSub}>Pick another prescription image</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.scanMiniAction, s.scanMiniActionLast]} onPress={startCameraScanFlow} activeOpacity={0.86}>
                  <Text style={s.scanMiniActionTitle}>Use camera</Text>
                  <Text style={s.scanMiniActionSub}>Retake with a clearer photo</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.scanEditorCard}>
              <View style={s.scanEditorCardTop}>
                <View style={s.scanEditorCardTitleWrap}>
                  <Text style={s.scanEditorLabel}>Detected prescription text</Text>
                  <Text style={s.scanEditorMicrocopy}>One medicine instruction per line gives the parser the best chance.</Text>
                </View>
                <View style={[s.scanStatusPill, trimmedScanText ? s.scanStatusPillReady : s.scanStatusPillEmpty]}>
                  <Text style={[s.scanStatusPillText, trimmedScanText ? s.scanStatusPillTextReady : s.scanStatusPillTextEmpty]}>
                    {scanStatus}
                  </Text>
                </View>
              </View>
              <TextInput
                style={[s.input, s.areaLarge, s.scanTextarea]}
                value={scanRawText}
                onChangeText={(value) => {
                  setScanRawText(value);
                  setScanMatchedCandidates([]);
                  setSelectedScanCandidateIndex(0);
                }}
                placeholder={'Example: Panadol 500 mg twice daily'}
                multiline
                editable
                autoFocus
                textAlignVertical="top"
                returnKeyType="default"
              />
              <Text style={s.scanEditorHint}>
                Tip: keep one medicine instruction per line when possible. This helps the parser separate the name, dose, and frequency.
              </Text>
            </View>

            <View style={s.scanInsightRow}>
              <View style={[s.scanInfoCard, s.scanInfoCardHalf]}>
                <Text style={s.scanInfoTitle}>Parser focus</Text>
                <Text style={s.scanInfoText}>Medicine name, strength such as 500 mg, and timing such as twice daily or tds.</Text>
              </View>
              <View style={[s.scanInfoCard, s.scanInfoCardHalf, s.scanInfoCardWarm]}>
                <Text style={s.scanInfoTitle}>Quick estimate</Text>
                <Text style={s.scanInfoStat}>{estimatedMedicineCount}</Text>
                <Text style={s.scanInfoText}>Possible instruction lines detected from your current text.</Text>
              </View>
            </View>

            {scanCandidates.length > 0 ? (
              <View style={s.scanSummaryCard}>
                <View style={s.scanSummaryTop}>
                  <Text style={s.scanSummaryTitle}>Parser preview</Text>
                  <Text style={s.scanSummaryCount}>{scanCandidates.length} medicine{scanCandidates.length === 1 ? '' : 's'}</Text>
                </View>
                <Text style={s.scanSummaryText}>
                  We found likely medicine lines below. Pick one, then continue to the confirmation step before the safety check.
                </Text>
              </View>
            ) : null}

            <View style={s.scanExampleCard}>
              <Text style={s.scanInfoTitle}>Good format example</Text>
              <Text style={s.scanExampleText}>Amoxicillin 500 mg tds{"\n"}Panadol 500 mg when needed{"\n"}Metformin 500 mg after dinner</Text>
            </View>

            <View style={s.scanExampleCard}>
              <Text style={s.scanInfoTitle}>Photo tips</Text>
              <Text style={s.scanExampleText}>Good lighting{"\n"}Keep the paper flat{"\n"}Avoid shadows{"\n"}Focus clearly{"\n"}Fill the frame with the prescription</Text>
            </View>

            {scanCandidates.length > 0 ? (
              <View style={s.scanExampleCard}>
                <Text style={s.scanInfoTitle}>Suggested medicine names</Text>
                <Text style={s.helpSmall}>Tap the medicine you want to confirm. We never run the safety check from OCR text alone.</Text>
                {scanCandidates.map((candidate, index) => {
                  const selected = index === activeScanCandidateIndex;
                  const detailParts = [candidate.dose, candidate.frequency].filter(Boolean);
                  return (
                    <TouchableOpacity
                      key={`${candidate.normalizedDrugName}-${candidate.sourceLine}-${index}`}
                      style={[s.option, selected ? s.optionOn : null]}
                      onPress={() => setSelectedScanCandidateIndex(index)}
                      activeOpacity={0.86}
                    >
                      <Text style={[s.optionText, selected ? s.optionTextOn : null]}>{candidate.medicineName}</Text>
                      {detailParts.length > 0 ? (
                        <Text style={s.helpSmall}>{detailParts.join(' | ')}</Text>
                      ) : null}
                      {candidate.confidence === 'medium' && candidate.ocrFragment ? (
                        <Text style={s.helpSmall}>
                          OCR read "{candidate.ocrFragment}" and the library corrected it to {candidate.medicineName}.
                        </Text>
                      ) : candidate.matchType ? (
                        <Text style={s.helpSmall}>
                          Library match: {candidate.matchType}
                          {candidate.matchedAlias ? ` via ${candidate.matchedAlias}` : ''}
                        </Text>
                      ) : null}
                      <Text style={s.helpSmall}>{candidate.sourceLine}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <View style={s.scanUtilityRow}>
              <TouchableOpacity
                style={s.scanGhostButton}
                onPress={() => {
                  setScanRawText('');
                  setScanMatchedCandidates([]);
                  setSelectedScanCandidateIndex(0);
                }}
              >
                <Text style={s.scanGhostButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.scanGhostButton}
                onPress={() => {
                  setScanRawText('Amoxicillin 500 mg tds');
                  setScanMatchedCandidates([]);
                  setSelectedScanCandidateIndex(0);
                }}
              >
                <Text style={s.scanGhostButtonText}>Use sample</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[s.scanPrimaryButton, s.scanPrimaryButtonBlock, !trimmedScanText && s.scanPrimaryButtonDisabled]}
              onPress={applyParsedPrescription}
              disabled={!trimmedScanText}
            >
              <Text style={s.scanPrimaryButtonText}>Continue to confirm name</Text>
            </TouchableOpacity>

            <Text style={s.helpSmall}>We use the edited text only to guess the medicine name before the safety check.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (route === 'voice-input') {
    const recognizedName = voiceDraft.trim();
    const voiceStatusText = !speechRecognitionAvailable
      ? 'Native voice not in this build — keyboard mic still works.'
      : isVoiceListening
        ? 'Listening now...'
        : recognizedName
          ? 'Voice captured.'
          : 'Waiting to start.';
    return (
      <View style={s.screen}>
        {header('Voice input', 'Say the medicine name clearly.')}
        <ScrollView contentContainerStyle={s.content}>
          <View style={[s.voiceHero, isVoiceListening ? s.voiceHeroActive : !speechRecognitionAvailable ? s.voiceHeroDisabled : null]}>
            <View style={s.voiceHeroTop}>
              <View style={[s.voiceOrb, isVoiceListening ? s.voiceOrbActive : null]}>
                <Text style={s.voiceOrbIcon}>{isVoiceListening ? '●' : '🎤'}</Text>
              </View>
              <View style={s.voiceHeroTextWrap}>
                <Text style={s.voiceEyebrow}>Voice medicine check</Text>
                <Text style={s.voiceTitle}>
                  {isVoiceListening ? 'Listening for the medicine name' : recognizedName ? 'Medicine name captured' : 'Ready to listen'}
                </Text>
                <Text style={s.voiceSubtitle}>{voiceStatusText}</Text>
              </View>
            </View>
            <View style={s.voiceProgressRow}>
              <View style={[s.voiceProgressStep, s.voiceProgressOn]} />
              <View style={[s.voiceProgressStep, recognizedName ? s.voiceProgressOn : null]} />
              <View style={s.voiceProgressStep} />
            </View>
            <Text style={s.voiceHint}>
              {speechRecognitionAvailable
                ? isVoiceListening
                  ? 'Speak only the medicine name as clearly as you can.'
                  : 'Press the microphone button below, say the medicine name, then review the result.'
                : 'This build does not include native speech recognition. Rebuild the app to use direct voice capture.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.voiceMicButton, isVoiceListening ? s.voiceMicButtonActive : null]}
            onPress={isVoiceListening ? stopVoiceRecognition : startVoiceRecognition}
          >
            <Text style={s.voiceMicIcon}>{isVoiceListening ? '■' : '🎙️'}</Text>
            <Text style={s.voiceMicText}>
              {isVoiceListening ? 'Stop listening' : 'Start microphone'}
            </Text>
          </TouchableOpacity>
          {voiceError ? (
            <View style={s.voiceErrorCard}>
              <Text style={s.voiceErrorTitle}>Voice didn’t start</Text>
              <Text style={s.voiceErrorText}>{voiceError}</Text>
            </View>
          ) : null}
          {voiceDiagnostic ? (
            <Text style={s.voiceDiagnostic}>{voiceDiagnostic}</Text>
          ) : null}
          <View style={s.voiceFallbackCard}>
            <Text style={s.voiceFallbackTitle}>
              {speechRecognitionAvailable ? 'Or type / use keyboard mic' : 'Type the medicine name'}
            </Text>
            <Text style={s.voiceFallbackText}>
              {speechRecognitionAvailable
                ? 'You can also tap here and use the microphone on your phone keyboard.'
                : 'This build does not include native voice recognition. Use the keyboard microphone (the mic icon on your phone keyboard) to dictate the medicine name.'}
            </Text>
            <TextInput
              style={s.input}
              value={voiceDraft}
              onChangeText={setVoiceDraft}
              placeholder="Medicine name"
              placeholderTextColor={palette.placeholder}
              autoCorrect={false}
              autoCapitalize="words"
            />
          </View>
          {recognizedName ? (
            <View style={s.voiceTranscriptCard}>
              <Text style={s.voiceTranscriptLabel}>Detected medicine</Text>
              <Text style={s.voiceTranscriptText}>{recognizedName}</Text>
              <Text style={s.voiceTranscriptHelp}>Check the name before continuing. You can retry if it does not look right.</Text>
            </View>
          ) : null}
          <View style={s.voiceActionRow}>
            {recognizedName ? (
              <TouchableOpacity style={s.voiceSecondaryAction} onPress={() => setVoiceDraft('')}>
                <Text style={s.voiceSecondaryActionText}>Try again</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.voiceSecondaryAction} onPress={() => speakAloud('Say the medicine name clearly after tapping start microphone.')}>
                <Text style={s.voiceSecondaryActionText}>Play instructions</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.voicePrimaryAction, !recognizedName && { opacity: 0.55 }]}
              onPress={confirmVoice}
              disabled={!recognizedName}
            >
              <Text style={s.voicePrimaryActionText}>Continue</Text>
            </TouchableOpacity>
          </View>
          <View style={s.voiceStepsCard}>
            <Text style={s.voiceStepsTitle}>How this works</Text>
            <View style={s.voiceStepRow}>
              <Text style={s.voiceStepNumber}>1</Text>
              <Text style={s.voiceStepText}>Tap the microphone and say the medicine name.</Text>
            </View>
            <View style={s.voiceStepRow}>
              <Text style={s.voiceStepNumber}>2</Text>
              <Text style={s.voiceStepText}>We identify the name and show it back to you.</Text>
            </View>
            <View style={s.voiceStepRow}>
              <Text style={s.voiceStepNumber}>3</Text>
              <Text style={s.voiceStepText}>You confirm it, then the safety check runs.</Text>
            </View>
          </View>
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
            ['Caregiver email', profile.caregiverEmail || 'Not added'],
            ['Caregiver phone', profile.caregiverPhone || 'Not added'],
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
              value={profile.caregiverEmail}
              onChangeText={(v) => setProfile((p) => ({ ...p, caregiverEmail: v }))}
              placeholder="Caregiver email"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={s.input}
              value={profile.caregiverPhone}
              onChangeText={(v) => setProfile((p) => ({ ...p, caregiverPhone: v }))}
              placeholder="Caregiver phone number"
              keyboardType="phone-pad"
            />
            <View style={s.disclaimerCard}>
              <Text style={s.sectionTitle}>Feedback for model improvement</Text>
              <Text style={s.helpSmall}>
                Optional: allow anonymized reaction outcomes and clinician overrides to improve safety predictions. You can log reactions either way.
              </Text>
              <TouchableOpacity
                style={[s.row, { marginTop: 8, alignItems: 'center' }]}
                onPress={() => setProfile((p) => ({ ...p, feedbackConsentForTraining: !p.feedbackConsentForTraining }))}
              >
                <Text style={s.chipText}>
                  {profile.feedbackConsentForTraining ? '☑' : '☐'} I consent to anonymized use of my feedback for continuous learning
                </Text>
              </TouchableOpacity>
            </View>
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
      const validation = validateOnboardingStep(onboardingStep, profile);
      if (!validation.valid) {
        Alert.alert('Validation', validation.message);
        return;
      }
      if (onboardingStep === 0) {
        setOnboardingStep(1);
        return;
      }
      if (onboardingStep === 1) {
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
                  <Text style={s.title}>Review your profile</Text>
                </View>
                <TextInput
                  style={s.input}
                  value={profile.caregiverEmail}
                  onChangeText={(v) => setProfile((p) => ({ ...p, caregiverEmail: v }))}
                  placeholder="Caregiver email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TextInput
                  style={s.input}
                  value={profile.caregiverPhone}
                  onChangeText={(v) => setProfile((p) => ({ ...p, caregiverPhone: v }))}
                  placeholder="Caregiver phone number"
                  keyboardType="phone-pad"
                />
                <Text style={s.helpSmall}>Check the details above, then finish setup.</Text>
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
        {header('Type medicine', 'Type the medicine name, then confirm it before the safety check.')}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Medicine name</Text>
            <TextInput
              style={s.input}
              value={medicineInput.medicineName}
              onChangeText={onMedicineNameChange}
              placeholder="Start typing… e.g. Panadol"
              placeholderTextColor={palette.placeholder}
              autoCorrect={false}
            />
            {searchBusy ? <Text style={s.helpSmall}>Searching library…</Text> : null}
            <View style={[s.suggestPanel, { maxHeight: 220 }]}>
              {suggestions.length === 0 ? (
                <Text style={s.suggestEmpty}>
                  {medicineInput.medicineName.length > 2
                    ? "No matches in our list — you can still continue with what you typed."
                    : "Type at least 3 letters to see suggestions."}
                </Text>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {suggestions.map((item, index) => (
                    <TouchableOpacity
                      key={`${item.rxnormCui || item.displayName}-${index}`}
                      style={s.suggestRow}
                      onPress={() => pickSuggestion(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={s.suggestTitle}>{item.displayName}</Text>
                      {item.ingredientName ? <Text style={s.suggestSub}>{item.ingredientName}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
            <TouchableOpacity
              style={s.bigPrimary}
              onPress={() => {
                if (!medicineInput.medicineName.trim()) {
                  Alert.alert('Missing', 'Enter a medicine name.');
                  return;
                }
                setMedicineInput((m) => ({ ...m, inputMethod: 'manual', spokenText: '' }));
                setRoute('confirm');
              }}
            >
              <Text style={s.bigPrimaryText}>Next: confirm medicine</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  if (route === 'confirm') {
    const confirmCandidates =
      medicineInput.inputMethod === 'scan'
        ? scanMatchedCandidates
        : [];
    const confirmTitle =
      medicineInput.inputMethod === 'voice'
        ? 'Review the medicine we identified from your voice, then confirm before we analyse.'
        : medicineInput.inputMethod === 'scan'
          ? 'We guessed the medicine name from your photo. Confirm or edit the name before we analyse safety.'
          : 'Please confirm the medicine details before we analyse.';
    return (
      <View style={s.screen}>
        {header('Confirm medicine', confirmTitle)}
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.confirmCard}>
            {medicineInput.inputMethod === 'voice' && medicineInput.spokenText ? (
              <>
                <Text style={s.confirmLabel}>Voice transcript</Text>
                <Text style={s.confirmValue}>{medicineInput.spokenText}</Text>
                <View style={s.confirmDivider} />
              </>
            ) : null}
            <Text style={s.fieldLabel}>Medicine name</Text>
            <TextInput
              style={s.input}
              value={medicineInput.medicineName}
              onChangeText={(v) =>
                setMedicineInput((m) => ({
                  ...m,
                  medicineName: v,
                  normalizedDrugName: '',
                }))
              }
              placeholder="Medicine name"
              autoCorrect={false}
            />
            {medicineInput.inputMethod !== 'scan' ? (
              <>
                <Text style={s.fieldLabel}>Dose</Text>
                <TextInput
                  style={s.input}
                  value={medicineInput.dose}
                  onChangeText={(v) => setMedicineInput((m) => ({ ...m, dose: v }))}
                  placeholder="Optional dose"
                  autoCorrect={false}
                />
                <Text style={s.fieldLabel}>How often</Text>
                <TextInput
                  style={s.input}
                  value={medicineInput.frequency}
                  onChangeText={(v) => setMedicineInput((m) => ({ ...m, frequency: v }))}
                  placeholder="Optional frequency"
                  autoCorrect={false}
                />
              </>
            ) : null}
            <Text style={s.helpSmall}>
              {medicineInput.inputMethod === 'scan'
                ? 'Only the medicine name will be checked next. Edit it here if OCR guessed incorrectly.'
                : 'You can correct the identified medicine name here before the safety check runs.'}
            </Text>
            {medicineInput.inputMethod === 'scan' && confirmCandidates.length > 1 ? (
              <>
                <Text style={s.fieldLabel}>Other medicine-name guesses</Text>
                <Text style={s.helpSmall}>Tap a name below if the OCR guess should be replaced before the safety check.</Text>
                {confirmCandidates.map((candidate, index) => {
                  const selected = candidate.normalizedDrugName === String(medicineInput.normalizedDrugName || '').toLowerCase();
                  return (
                    <TouchableOpacity
                      key={`${candidate.normalizedDrugName}-${candidate.sourceLine}-${index}`}
                      style={[s.option, selected ? s.optionOn : null]}
                      onPress={() =>
                        setMedicineInput((m) => ({
                          ...m,
                          medicineName: candidate.medicineName,
                          normalizedDrugName: candidate.normalizedDrugName,
                          dose: candidate.dose || '',
                          frequency: candidate.frequency || '',
                          ocrSourceLine: candidate.sourceLine || '',
                        }))
                      }
                      activeOpacity={0.86}
                    >
                      <Text style={[s.optionText, selected ? s.optionTextOn : null]}>{candidate.medicineName}</Text>
                      <Text style={s.helpSmall}>{candidate.sourceLine}</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : null}
          </View>
          <View style={s.split}>
            <TouchableOpacity style={s.secondaryHalf} onPress={() => setRoute(confirmBackRoute)}>
              <Text style={s.secondaryText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryHalf, !medicineInput.medicineName.trim() && { opacity: 0.55 }]}
              onPress={() => {
                if (!medicineInput.medicineName.trim()) {
                  Alert.alert('Missing medicine', 'Please confirm the medicine name before continuing.');
                  return;
                }
                minimalReturnRoute.current = 'confirm';
                setMinimalCheck(emptyMinimal);
                setRoute('check-minimal');
              }}
              disabled={!medicineInput.medicineName.trim()}
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
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {REACTION_OUTCOMES.map((level) => (
              <TouchableOpacity
                key={level}
                style={[s.chip, standaloneReaction.severity === level && s.chipOn]}
                onPress={() => setStandaloneReaction((r) => ({ ...r, severity: level }))}
              >
                <Text style={[s.chipText, standaloneReaction.severity === level && s.chipTextOn]}>{level}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[s.row, { marginTop: 8, alignItems: 'center' }]}
            onPress={() => setStandaloneReaction((r) => ({ ...r, pharmacistConfirmed: !r.pharmacistConfirmed }))}
          >
            <Text style={s.chipText}>{standaloneReaction.pharmacistConfirmed ? '☑' : '☐'} Pharmacist confirmed this outcome</Text>
          </TouchableOpacity>
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
    const report =
      latestResult?.analysis?.riskReport ||
      latestResult?.analysis?.dataUsed?.riskReport ||
      latestResult?.card?.dataUsed?.riskReport ||
      null;
    const blocked =
      (report?.safetyControls?.requiresClinicalOverride && !clinicalOverride.accepted) ||
      (latestResult?.card?.riskLevel === 'Dangerous' && !clinicalOverride.accepted);
    return (
      <View style={s.screen}>
        {header('Your result', 'Here is your medicine safety result. Tap the speaker to hear it read aloud.')}
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {latestResult?.card ? resultBody(latestResult.card, latestResult.analysis) : null}
          <View style={s.disclaimerCard}>
            <Text style={s.disclaimerText}>Results depend on the information you entered and our knowledge base — not a substitute for professional care.</Text>
          </View>
          {!blocked ? (
            <>
              <Text style={s.sectionTitle}>After you take a medicine</Text>
              <TouchableOpacity style={s.tile} onPress={() => setRoute('follow-up')}>
                <Text style={s.tileTitle}>Follow-up: how did you feel?</Text>
                <Text style={s.tileSub}>Update your allergy profile after you use the medicine.</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={s.blockBanner}>
              <Text style={s.blockText}>Follow-up actions remain blocked until a clinical override is documented above.</Text>
            </View>
          )}
          <TouchableOpacity style={s.bigPrimary} onPress={() => setRoute('medicine-hub')}>
            <Text style={s.bigPrimaryText}>Check another medicine</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBig} onPress={() => setRoute('history')}>
            <Text style={s.secondaryBigText}>View past checks</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.secondaryBig, { marginTop: 10 }]} onPress={() => setRoute('home')}>
            <Text style={s.secondaryBigText}>Back to home</Text>
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
          <Text style={s.fieldLabel}>Outcome</Text>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {REACTION_OUTCOMES.map((level) => (
              <TouchableOpacity key={level} style={[s.chip, followUp.severity === level && s.chipOn]} onPress={() => setFollowUp((f) => ({ ...f, severity: level }))}>
                <Text style={[s.chipText, followUp.severity === level && s.chipTextOn]}>{level}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[s.row, { marginTop: 8, alignItems: 'center' }]}
            onPress={() => setFollowUp((f) => ({ ...f, pharmacistConfirmed: !f.pharmacistConfirmed }))}
          >
            <Text style={s.chipText}>{followUp.pharmacistConfirmed ? '☑' : '☐'} Pharmacist confirmed this outcome</Text>
          </TouchableOpacity>
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
            historyItems.map((item) => {
              const historyScoreSummary = buildHistoryScoreSummary(item, item.card);
              return (
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
                  {historyScoreSummary ? <Text style={s.historyScoreSummary}>{historyScoreSummary}</Text> : null}
                </View>
                <View style={[s.badge, tone(String(item.riskLevel || 'Warning')).box]}>
                  <Text style={[s.badgeText, tone(String(item.riskLevel || 'Warning')).text]}>{item.riskLevel || 'Saved'}</Text>
                </View>
                <Text style={s.historyChevron}>›</Text>
              </TouchableOpacity>
              );
            })
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
  scanCaptureScreen: { flex: 1, backgroundColor: palette.primaryLight },
  scanCaptureTop: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.header,
    borderBottomWidth: 0,
  },
  scanCaptureBack: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  scanCaptureBackText: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: '300',
    marginTop: -4,
  },
  scanCaptureTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    marginHorizontal: 10,
    letterSpacing: -0.5,
  },
  scanCaptureInfo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  scanCaptureInfoText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  scanCaptureContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
  },
  scanFlowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  scanFlowStep: {
    width: '31.5%',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: '#dde7f0',
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanFlowStepActive: {
    backgroundColor: '#e8f6ee',
    borderColor: '#b9ddc8',
  },
  scanFlowStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e9eef5',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 13,
    fontWeight: '800',
  },
  scanFlowStepNumberActive: {
    backgroundColor: palette.primary,
    color: '#ffffff',
  },
  scanFlowStepLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  scanFlowStepLabelActive: {
    color: palette.primary,
  },
  scanIntroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.primaryMuted,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#c8e9dd',
    marginBottom: 20,
    ...cardShadow,
  },
  scanIntroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  scanIntroIcon: {
    fontSize: 32,
  },
  scanIntroBody: {
    flex: 1,
  },
  scanIntroTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: palette.header,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  scanIntroText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#2d6a50',
  },
  scanHighlightCard: {
    backgroundColor: '#0d3a2d',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    overflow: 'hidden',
    ...cardShadow,
  },
  scanHighlightBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  scanHighlightBadgeText: {
    color: '#a8e6d1',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  scanHighlightTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  scanHighlightText: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    color: '#d0e8df',
  },
  scanPreviewShell: {
    height: 560,
    borderRadius: 28,
    backgroundColor: '#111827',
    padding: 30,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 20,
    ...cardShadow,
  },
  scanPreviewCornerTl: {
    position: 'absolute',
    top: 42,
    left: 42,
    width: 44,
    height: 44,
    borderLeftWidth: 6,
    borderTopWidth: 6,
    borderColor: '#58d2b6',
    borderTopLeftRadius: 12,
  },
  scanPreviewCornerTr: {
    position: 'absolute',
    top: 42,
    right: 42,
    width: 44,
    height: 44,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderColor: '#58d2b6',
    borderTopRightRadius: 12,
  },
  scanPreviewCornerBl: {
    position: 'absolute',
    bottom: 42,
    left: 42,
    width: 44,
    height: 44,
    borderLeftWidth: 6,
    borderBottomWidth: 6,
    borderColor: '#58d2b6',
    borderBottomLeftRadius: 12,
  },
  scanPreviewCornerBr: {
    position: 'absolute',
    bottom: 42,
    right: 42,
    width: 44,
    height: 44,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderColor: '#58d2b6',
    borderBottomRightRadius: 12,
  },
  scanPreviewGridVerticalLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '35%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  scanPreviewGridVerticalRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: '35%',
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  scanPreviewGridHorizontalTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '34%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  scanPreviewGridHorizontalBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '31%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  scanLiveFrame: {
    flex: 1,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(15,23,42,0.54)',
    justifyContent: 'space-between',
    padding: 22,
  },
  scanLiveFrameInner: {
    marginTop: 18,
    maxWidth: '82%',
  },
  scanLiveFrameEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#a7f3d0',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  scanLiveFrameTitle: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
    color: '#ffffff',
  },
  scanLiveFrameText: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    color: '#d1d5db',
  },
  scanLiveFrameFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
  },
  scanLiveHintChip: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  scanLiveHintChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f8fafc',
  },
  scanPaper: {
    flex: 1,
    alignSelf: 'center',
    width: '74%',
    backgroundColor: '#fffefe',
    borderRadius: 2,
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  scanPaperHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  scanPaperRx: {
    fontSize: 38,
    fontWeight: '500',
    color: '#111827',
  },
  scanPaperDoctorBlock: {
    alignItems: 'flex-end',
  },
  scanPaperDoctor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  scanPaperDoctorMeta: {
    fontSize: 10,
    color: '#1f2937',
    marginTop: 2,
  },
  scanPaperPatientRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  scanPaperLabel: {
    fontSize: 10,
    color: '#111827',
    marginBottom: 6,
  },
  scanPaperPatientValues: {
    marginLeft: 14,
  },
  scanPaperHand: {
    fontSize: 10,
    color: '#1f2937',
    marginBottom: 6,
  },
  scanPaperDivider: {
    height: 1,
    backgroundColor: '#6b7280',
    marginBottom: 14,
  },
  scanPaperMedicine: {
    fontSize: 10,
    color: '#111827',
    marginBottom: 6,
  },
  scanPaperMedicineMeta: {
    fontSize: 10,
    color: '#1f2937',
    marginBottom: 12,
    marginLeft: 18,
  },
  scanPaperSignatureWrap: {
    alignItems: 'flex-end',
    marginTop: 'auto',
  },
  scanPaperSignature: {
    fontSize: 20,
    color: '#111827',
    marginBottom: 2,
  },
  scanTipsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e6ebf3',
    marginBottom: 20,
    ...cardShadow,
  },
  scanTipsTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1d7b60',
    marginBottom: 8,
  },
  scanTipsBullet: {
    fontSize: 14,
    lineHeight: 22,
    color: '#475569',
    marginBottom: 4,
  },
  scanCaptureActions: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  scanSideAction: {
    flex: 0.32,
    alignItems: 'center',
  },
  scanSideActionIcon: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  scanSideActionIconActive: {
    backgroundColor: palette.primaryMuted,
    borderColor: palette.primary,
  },
  scanSideActionIconGallery: {
    backgroundColor: '#f0f4ff',
    borderColor: '#d1e0ff',
  },
  scanSideActionIconFlash: {
    backgroundColor: '#fffcf0',
    borderColor: '#ffe5b4',
  },
  scanSideActionIconText: {
    fontSize: 28,
  },
  scanSideActionLabel: {
    marginTop: 12,
    fontSize: 15,
    color: palette.text,
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  scanSideActionMeta: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textTertiary,
    textAlign: 'center',
  },
  scanCaptureButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0.4,
  },
  scanCaptureButtonInner: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
  scanCaptureButtonIcon: {
    fontSize: 44,
    color: '#fff',
  },
  scanCaptureButtonLabel: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '800',
    color: palette.text,
    letterSpacing: -0.3,
  },
  scanCaptureHint: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 15,
    color: palette.textSecondary,
    fontWeight: '500',
  },
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
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  backText: { color: '#fff', fontSize: 32, fontWeight: '300', marginTop: -2 },
  topTitleWrap: { flex: 1, paddingRight: 8 },
  topTitle: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 26 },
  speakTop: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakTopText: { fontSize: 24 },
  speakTopPlaceholder: { width: 52 },
  content: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  loadTitle: { marginTop: 20, fontSize: 22, fontWeight: '700', color: palette.text, textAlign: 'center' },
  loadText: { marginTop: 12, fontSize: elder.body, color: palette.textSecondary, textAlign: 'center', lineHeight: elder.bodyLine, maxWidth: 320 },
  scanHero: {
    backgroundColor: palette.primaryLight,
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: '#c8e9dd',
    ...cardShadow,
  },
  scanHeroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: palette.primaryMuted,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
  },
  scanHeroBadgeText: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  scanHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanOrb: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: '#d8f2e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  scanOrbIcon: {
    fontSize: 30,
    color: palette.primary,
    fontWeight: '700',
  },
  scanHeroTextWrap: {
    flex: 1,
  },
  scanEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  scanTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: palette.text,
    letterSpacing: -0.4,
  },
  scanSubtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  scanProgressTrack: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 8,
  },
  scanProgressStep: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#d9e7de',
  },
  scanProgressStepOn: {
    backgroundColor: palette.primary,
  },
  scanPhaseLabel: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
    letterSpacing: -0.3,
  },
  scanPhaseHint: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 21,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  scanLoadCard: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    ...cardShadow,
  },
  scanStepRail: {
    width: '100%',
    marginTop: 18,
  },
  scanStepPill: {
    borderRadius: 16,
    backgroundColor: '#f4f8f5',
    borderWidth: 1.5,
    borderColor: '#d9e7de',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  scanStepPillOn: {
    backgroundColor: palette.primaryMuted,
    borderColor: palette.primary,
  },
  scanStepPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  scanStepPillTextOn: {
    color: palette.primary,
    fontWeight: '700',
  },
  scanChecklist: {
    backgroundColor: '#fef5e7',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#f5d9a8',
  },
  scanChecklistTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.text,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  scanChecklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  scanChecklistBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fde7bf',
    color: '#a16207',
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 10,
  },
  scanChecklistText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
  },
  scanEditorHero: {
    backgroundColor: palette.primaryLight,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#c8e9dd',
    ...cardShadow,
  },
  scanEditorTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: palette.text,
    letterSpacing: -0.4,
  },
  scanEditorSub: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  scanReviewBanner: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: palette.primaryMuted,
    borderWidth: 1.5,
    borderColor: '#c8e9dd',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanReviewStat: {
    width: 88,
    alignItems: 'center',
  },
  scanReviewStatValue: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.primary,
  },
  scanReviewStatLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  scanReviewDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#c8e9dd',
    marginHorizontal: 14,
  },
  scanReviewBody: {
    flex: 1,
  },
  scanReviewTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: palette.primary,
    letterSpacing: -0.3,
  },
  scanReviewText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  scanMetaRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 10,
  },
  scanMetaChip: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
    ...cardShadow,
  },
  scanMetaChipTight: {
    marginRight: 10,
  },
  scanMetaValue: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.primary,
    letterSpacing: -0.3,
  },
  scanMetaLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '800',
    color: palette.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  scanRescanRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  scanMiniAction: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    ...cardShadow,
  },
  scanMiniActionLast: {
    marginRight: 0,
  },
  scanMiniActionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.text,
  },
  scanMiniActionSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
  },
  scanEditorCard: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: palette.border,
    ...cardShadow,
  },
  scanEditorCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  scanEditorCardTitleWrap: {
    flex: 1,
    paddingRight: 12,
  },
  scanEditorLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  scanEditorMicrocopy: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  scanStatusPill: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  scanStatusPillReady: {
    backgroundColor: palette.primaryMuted,
  },
  scanStatusPillEmpty: {
    backgroundColor: '#f0f4f8',
  },
  scanStatusPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  scanStatusPillTextReady: {
    color: palette.primary,
  },
  scanStatusPillTextEmpty: {
    color: palette.textTertiary,
  },
  scanTextarea: {
    minHeight: 220,
    backgroundColor: '#fcfdfd',
    borderColor: palette.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  scanEditorHint: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: palette.textSecondary,
    fontWeight: '500',
  },
  scanInsightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  scanInfoCard: {
    backgroundColor: '#eef6ff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#cfe0f6',
  },
  scanInfoCardHalf: {
    width: '48.5%',
    marginBottom: 0,
  },
  scanInfoCardWarm: {
    backgroundColor: '#fff8ed',
    borderColor: '#f2dec0',
  },
  scanInfoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 6,
  },
  scanInfoText: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.textSecondary,
  },
  scanInfoStat: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.text,
    marginBottom: 4,
  },
  scanSummaryCard: {
    backgroundColor: '#eef8f3',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#cfe7d9',
  },
  scanSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanSummaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f5132',
  },
  scanSummaryCount: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.primary,
  },
  scanSummaryText: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.textSecondary,
  },
  scanExampleCard: {
    backgroundColor: '#f7fafc',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dbe7f3',
  },
  scanExampleText: {
    fontSize: 14,
    lineHeight: 23,
    color: palette.text,
  },
  scanUtilityRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  scanGhostButton: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    ...cardShadow,
  },
  scanGhostButtonText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  scanPrimaryButton: {
    flex: 1.35,
    backgroundColor: palette.primary,
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    ...cardShadow,
  },
  scanPrimaryButtonBlock: {
    flex: 0,
    width: '100%',
    marginLeft: 0,
    marginBottom: 8,
  },
  scanPrimaryButtonDisabled: {
    opacity: 0.55,
  },
  scanPrimaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
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
  statusChipText: { fontSize: 15, fontWeight: '700' },
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
  heroTitle: { fontSize: 26, fontWeight: '700', color: palette.text },
  heroSub: { marginTop: 10, fontSize: elder.body, color: palette.textSecondary, lineHeight: elder.bodyLine },
  disclaimerCard: {
    backgroundColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    borderLeftWidth: 5,
    borderLeftColor: palette.primary,
  },
  disclaimerText: { fontSize: 16, color: palette.text, lineHeight: 24, fontWeight: '500' },
  bigPrimary: {
    backgroundColor: palette.primary,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginTop: 6,
    minHeight: elder.minTouch,
    justifyContent: 'center',
    ...cardShadow,
  },
  ctaInner: { flexDirection: 'row', alignItems: 'center' },
  ctaIconBubble: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  ctaIcon: { fontSize: 26 },
  ctaTextCol: { flex: 1 },
  bigPrimaryText: { color: '#fff', fontSize: elder.button, fontWeight: '800' },
  bigPrimarySub: { color: 'rgba(255,255,255,0.95)', fontSize: 16, marginTop: 6, fontWeight: '500', lineHeight: 22 },
  primaryActionCard: { borderWidth: 0 },
  secondaryBig: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 14,
    minHeight: elder.minTouch,
    justifyContent: 'center',
    ...cardShadow,
  },
  secondaryBigText: { color: palette.text, fontSize: elder.button, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: palette.text, marginTop: 24, marginBottom: 14 },
  shortcutRow: { flexDirection: 'row', justifyContent: 'space-between' },
  shortcutHalf: {
    width: '48%',
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 2,
    borderColor: palette.border,
    minHeight: 120,
    ...cardShadow,
  },
  shortcutIcon: { fontSize: 32, marginBottom: 12 },
  shortcutTitle: { fontSize: 17, fontWeight: '800', color: palette.text },
  shortcutSub: { fontSize: 15, color: palette.textSecondary, marginTop: 6, lineHeight: 22, fontWeight: '500' },
  tile: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: palette.border,
    padding: 18,
    marginBottom: 14,
    ...cardShadow,
  },
  tileTitle: { fontSize: 17, fontWeight: '800', color: palette.text, letterSpacing: -0.3 },
  tileSub: { marginTop: 6, fontSize: 15, color: palette.textSecondary, lineHeight: 22, fontWeight: '500' },
  hubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: palette.border,
    minHeight: 80,
    ...cardShadow,
  },
  hubIcon: { width: 60, height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  hubIconTeal: { backgroundColor: '#d0fdf3' },
  hubIconBlue: { backgroundColor: '#dbeafe' },
  hubIconViolet: { backgroundColor: '#ede9fe' },
  hubEmoji: { fontSize: 26 },
  hubRowBody: { flex: 1 },
  hubRowTitle: { fontSize: 18, fontWeight: '800', color: palette.text },
  hubRowSub: { fontSize: 16, color: palette.textSecondary, marginTop: 6, fontWeight: '500', lineHeight: 22 },
  hubChevron: { fontSize: 26, color: palette.textSecondary, fontWeight: '300' },
  lead: { fontSize: elder.body, color: palette.textSecondary, lineHeight: elder.bodyLine, marginBottom: 18, fontWeight: '500' },
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
  voiceHero: {
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dbe7f3',
    ...cardShadow,
  },
  voiceHeroActive: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  voiceHeroDisabled: {
    backgroundColor: '#f8fafc',
    borderColor: palette.border,
    opacity: 0.82,
  },
  voiceHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceHeroTextWrap: {
    flex: 1,
  },
  voiceEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  voiceOrb: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  voiceOrbActive: {
    backgroundColor: '#fed7aa',
  },
  voiceOrbIcon: {
    fontSize: 28,
    color: palette.text,
    fontWeight: '700',
  },
  voiceTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: palette.text,
  },
  voiceSubtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
  },
  voiceProgressRow: {
    flexDirection: 'row',
    marginTop: 18,
    marginBottom: 14,
  },
  voiceProgressStep: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#dbe7f3',
    marginRight: 8,
  },
  voiceProgressOn: {
    backgroundColor: palette.primary,
  },
  voiceHint: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
  },
  small: { fontSize: 11, fontWeight: '800', color: palette.primary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1.2 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: palette.border,
    padding: 18,
    marginBottom: 16,
    ...cardShadow,
  },
  cardTitle: { fontSize: elder.label, fontWeight: '700', color: palette.primary, marginBottom: 10 },
  cardText: { fontSize: elder.body, lineHeight: elder.bodyLine, color: palette.text, fontWeight: '500' },
  helpSmall: { fontSize: 15, color: palette.textSecondary, lineHeight: 22, marginTop: 8, fontWeight: '500' },
  voiceMicButton: {
    backgroundColor: palette.primary,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...cardShadow,
  },
  voiceMicButtonActive: {
    backgroundColor: palette.warn,
  },
  voiceMicIcon: {
    fontSize: 22,
    color: '#fff',
    marginRight: 10,
  },
  voiceMicText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  voiceErrorCard: {
    backgroundColor: palette.dangerBg,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  voiceErrorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: palette.danger,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  voiceErrorText: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.text,
  },
  voiceDiagnostic: {
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  voiceFallbackCard: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: palette.border,
    ...cardShadow,
  },
  voiceFallbackTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 8,
  },
  voiceFallbackText: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.textSecondary,
    marginBottom: 12,
  },
  voiceTranscriptCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#c7d8ec',
    ...cardShadow,
  },
  voiceTranscriptLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  voiceTranscriptText: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    color: palette.text,
  },
  voiceTranscriptHelp: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.textSecondary,
    marginTop: 10,
  },
  voiceActionRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  voiceSecondaryAction: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    ...cardShadow,
  },
  voiceSecondaryActionText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  voicePrimaryAction: {
    flex: 1,
    backgroundColor: palette.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    ...cardShadow,
  },
  voicePrimaryActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  voiceStepsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#dbe7f3',
  },
  voiceStepsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 12,
  },
  voiceStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  voiceStepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.primaryMuted,
    color: palette.primary,
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 10,
  },
  voiceStepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
  },
  fieldLabel: { fontSize: elder.label, fontWeight: '700', color: palette.text, marginBottom: 10, marginTop: 6 },
  input: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: elder.input,
    color: palette.text,
    marginBottom: 16,
    minHeight: 58,
  },
  area: { minHeight: 120, textAlignVertical: 'top', paddingVertical: 12 },
  areaLarge: { minHeight: 180, textAlignVertical: 'top', paddingVertical: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
    marginRight: 10,
    marginBottom: 12,
    minHeight: 50,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: palette.primary, borderColor: palette.primary },
  chipText: { fontSize: 17, fontWeight: '700', color: palette.text },
  chipTextOn: { color: '#fff' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.borderStrong, marginHorizontal: 5 },
  dotOn: { width: 24, borderRadius: 4, backgroundColor: palette.primary },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '800', color: palette.text },
  option: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: palette.border,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 14,
    minHeight: 58,
    justifyContent: 'center',
    ...cardShadow,
  },
  optionOn: { backgroundColor: palette.primaryMuted, borderColor: palette.primary, borderWidth: 2 },
  optionText: { fontSize: 18, fontWeight: '700', color: palette.text },
  optionTextOn: { color: palette.primary },
  suggestPanel: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: palette.border,
    marginBottom: 14,
    overflow: 'hidden',
    ...cardShadow,
  },
  suggestRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  suggestTitle: { fontSize: 16, fontWeight: '700', color: palette.text, letterSpacing: -0.2 },
  suggestSub: { fontSize: 14, color: palette.textSecondary, marginTop: 4, fontWeight: '500' },
  suggestEmpty: { padding: 16, fontSize: 14, color: palette.textSecondary, lineHeight: 20 },
  confirmCard: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
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
  secondaryText: { color: palette.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  resultMedLabel: { fontSize: 14, fontWeight: '700', color: palette.primary, marginBottom: 4 },
  med: { fontSize: 24, fontWeight: '800', color: palette.text, marginTop: 4, marginBottom: 18 },
  banner: { borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 18, ...cardShadow },
  bannerWarn: { backgroundColor: palette.warnBg, borderWidth: 2, borderColor: '#fcd34d' },
  bannerSafe: { backgroundColor: palette.safeBg, borderWidth: 2, borderColor: '#6ee7b7' },
  bannerDanger: { backgroundColor: palette.dangerBg, borderWidth: 2, borderColor: '#fca5a5' },
  riskPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  riskPillText: { fontSize: 14, fontWeight: '800' },
  pillSafe: { backgroundColor: '#d1fae5' },
  pillSafeText: { color: '#065f46', fontSize: 14, fontWeight: '800' },
  pillWarn: { backgroundColor: '#fef08a' },
  pillWarnText: { color: '#92400e', fontSize: 14, fontWeight: '800' },
  pillDanger: { backgroundColor: '#fee2e2' },
  pillDangerText: { color: '#991b1b', fontSize: 14, fontWeight: '800' },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: palette.text },
  bannerSub: { fontSize: 15, marginTop: 6, lineHeight: 22, color: palette.text, fontWeight: '600' },
  elderScoreSimple: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: palette.border,
    padding: 20,
    marginBottom: 14,
    ...cardShadow,
  },
  elderScoreTitle: { fontSize: 18, fontWeight: '800', color: palette.text },
  elderScoreHint: { fontSize: 14, color: palette.textSecondary, marginTop: 8, lineHeight: 21 },
  detailsToggle: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: palette.borderStrong,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 18,
    minHeight: elder.minTouch,
    justifyContent: 'center',
  },
  detailsToggleText: { fontSize: 16, fontWeight: '700', color: palette.text, textAlign: 'center', lineHeight: 24 },
  trackLarge: { height: 16, borderRadius: 8 },
  fillLarge: { borderRadius: 8 },
  scoreValueLarge: { marginLeft: 14, fontSize: 22, fontWeight: '800', color: palette.text, minWidth: 36, textAlign: 'right' },
  emergencyBanner: {
    backgroundColor: palette.dangerBg,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#fecaca',
  },
  emergencyTitle: { fontSize: 20, fontWeight: '800', color: palette.danger },
  emergencyText: { marginTop: 10, fontSize: elder.body, color: palette.text, lineHeight: elder.bodyLine },
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
  interactionTitle: { fontSize: 18, fontWeight: '700', color: palette.warn },
  interactionLevel: { marginTop: 10, fontSize: elder.body, fontWeight: '600', color: palette.text, lineHeight: elder.bodyLine },
  blockBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fecaca',
    padding: 18,
    marginBottom: 14,
  },
  blockTitle: { fontSize: 18, fontWeight: '800', color: palette.danger },
  blockText: { marginTop: 10, fontSize: elder.body, color: palette.text, lineHeight: elder.bodyLine },
  ruleRow: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  ruleLabel: { fontSize: 17, fontWeight: '600', color: palette.text },
  ruleRecommendation: { marginTop: 8, fontSize: 16, color: palette.textSecondary, lineHeight: 24 },
  shapFeature: { fontSize: 13, fontWeight: '600', color: palette.textSecondary },
  shapTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.border,
    overflow: 'hidden',
    marginTop: 4,
  },
  shapFill: { height: '100%', borderRadius: 4 },
  warn: { backgroundColor: palette.warnBg },
  warnText: { color: palette.warn },
  safe: { backgroundColor: palette.safeBg },
  safeText: { color: palette.safe },
  danger: { backgroundColor: palette.dangerBg },
  dangerText: { color: palette.danger },
  bullet: { fontSize: elder.body, lineHeight: elder.bodyLine, fontWeight: '500', marginTop: 6, color: palette.text },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: palette.border,
    minHeight: 72,
    ...cardShadow,
  },
  historyCardMain: { flex: 1, paddingRight: 8 },
  historyMed: { fontSize: 19, fontWeight: '700', color: palette.text },
  historyDate: { fontSize: 16, color: palette.textSecondary, marginTop: 6 },
  historyScoreSummary: { fontSize: 14, color: palette.textSecondary, marginTop: 8, fontWeight: '600' },
  historyChevron: { fontSize: 26, color: palette.textSecondary, marginLeft: 4 },
  emptyState: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    ...cardShadow,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: palette.text },
  emptySub: { fontSize: elder.body, color: palette.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: elder.bodyLine },
  emptyBtn: { marginTop: 22, backgroundColor: palette.primary, paddingVertical: 16, paddingHorizontal: 28, borderRadius: 14, minHeight: elder.minTouch, justifyContent: 'center' },
  emptyBtnText: { color: '#fff', fontSize: elder.button, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 0, alignSelf: 'center' },
  badgeText: { fontSize: 12, fontWeight: '800' },
});
