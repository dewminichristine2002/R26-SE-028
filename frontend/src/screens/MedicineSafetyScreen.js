import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as expoModulesCore from 'expo-modules-core';
import { allergyService } from '../services/allergyService';
import { extractPrescriptionTextFromImage } from '../services/prescriptionOcrService';
import {
  getExpoSpeech,
  getExpoImagePicker,
  getExpoSpeechRecognitionModule,
} from '../utils/optionalExpoModules';

const ExpoEventEmitter = expoModulesCore.EventEmitter || expoModulesCore.ExpoEventEmitter || null;

const QUESTIONS = [
  {
    key: 'pastReaction',
    label: 'Have you ever had a reaction after taking a medicine?',
    options: ['Yes', 'No', 'Not sure'],
  },
  {
    key: 'reactionSymptoms',
    label: 'What happened after you took the medicine?',
    options: ['Skin rash', 'Swelling', 'Breathing difficulty', 'Vomiting', 'Dizziness', 'Other', 'Not sure'],
    detailKey: 'reactionSymptomsDetail',
  },
  {
    key: 'medicineName',
    label: 'Do you know which medicine caused the reaction?',
    options: ['Yes', 'No', 'Not sure'],
    detailKey: 'medicineNameDetail',
  },
  {
    key: 'doctorAdvice',
    label: 'Has a doctor or pharmacist told you to avoid any medicine?',
    options: ['Yes', 'No', 'Not sure'],
    detailKey: 'doctorAdviceDetail',
  },
  {
    key: 'painkillerAntibioticReaction',
    label: 'Have you ever had a reaction after taking an antibiotic or painkiller?',
    options: ['Yes', 'No', 'Not sure'],
    detailKey: 'painkillerAntibioticReactionDetail',
  },
];

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
};

const emptyInput = {
  inputMethod: 'manual',
  medicineName: '',
  normalizedDrugName: '',
  dose: '',
  frequency: '',
};

const emptyCheck = {
  takenBefore: null,
  hadReactionBefore: null,
  symptomMatch: '',
  symptomDetail: '',
  severity: '',
  notes: '',
  takingOtherMedicinesNow: null,
};

const errorMessage = (error, fallback) =>
  error?.response?.data?.error || error?.message || fallback;

const firstNonEmptyLine = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';

const cleanVoiceMedicineQuery = (value) =>
  String(value || '')
    .replace(/\b(?:i want to check|can you check|check|medicine|drug|tablet|capsule|syrup|please)\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/gi, ' ')
    .replace(/\b(?:once|twice|three times|daily|a day|per day|morning|night)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getDetectedMedicineCandidate = (event) => {
  const candidates = [
    event?.panelMedicineName,
    event?.medicineName,
    event?.detectedMedicineName,
    event?.detectedName,
    event?.results?.[0]?.medicineName,
    event?.results?.[0]?.detectedMedicineName,
  ];

  return candidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
};

const normalizeAnswers = (answers = []) => {
  const state = {};
  QUESTIONS.forEach((question) => {
    state[question.key] = '';
    if (question.detailKey) {
      state[question.detailKey] = '';
    }
  });

  answers.forEach((answer) => {
    const question = QUESTIONS.find((item) => item.key === answer.questionKey);
    if (!question) {
      return;
    }

    const raw = answer.answerText || '';
    if (question.detailKey && raw.includes(': ')) {
      const [base, ...rest] = raw.split(': ');
      state[question.key] = base;
      state[question.detailKey] = rest.join(': ');
      return;
    }

    state[question.key] = raw;
  });

  return state;
};

const profileComplete = (profile) =>
  Boolean(profile.age?.trim()) &&
  Boolean(profile.gender?.trim()) &&
  profile.hasMedicineAllergy !== null;

const errorText = (error, fallback) => error?.response?.data?.error || error?.message || fallback;

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const isValidPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10;
};

const sanitizeProfilePayload = (profile) => ({
  ...profile,
  age: String(profile.age || '').trim(),
  gender: String(profile.gender || '').trim(),
  knownAllergiesText: String(profile.knownAllergiesText || '').trim(),
  chronicDiseasesText: String(profile.chronicDiseasesText || '').trim(),
  currentMedicationsText: String(profile.currentMedicationsText || '').trim(),
  emergencyContact: String(profile.emergencyContact || '').trim(),
  caregiverDetails: String(profile.caregiverDetails || '').trim(),
  caregiverEmail: String(profile.caregiverEmail || '').trim().toLowerCase(),
  caregiverPhone: String(profile.caregiverPhone || '').trim(),
});

const sanitizeMedicineInput = (input) => ({
  ...input,
  medicineName: String(input.medicineName || '').trim(),
  normalizedDrugName: String(input.normalizedDrugName || '').trim(),
  dose: String(input.dose || '').trim(),
  frequency: String(input.frequency || '').trim(),
});

const sanitizeMedicineCheck = (check) => ({
  ...check,
  symptomMatch: String(check.symptomMatch || '').trim(),
  symptomDetail: String(check.symptomDetail || '').trim(),
  notes: String(check.notes || '').trim(),
});

const isValidMedicineName = (value) => {
  const text = String(value || '').trim();
  return text.length >= 2 && /[A-Za-z]/.test(text);
};

const formatDate = (value) => {
  if (!value) {
    return 'No date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const cleanExplanation = (text) => {
  if (!text) {
    return 'No explanation available.';
  }

  return String(text)
    .replace(/The baseline ML model also estimated [^.]+ reaction risk\./gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return `${(numeric * 100).toFixed(1)}%`;
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
};

const displayRiskLevel = (riskLevel) => {
  const normalized = String(riskLevel || '').toLowerCase();

  if (normalized === 'dangerous') return 'Dangerous';
  if (normalized === 'safe') return 'Safe';

  return 'Caution';
};

const getRiskCopy = (riskLevel, analysis) => {
  const directAllergy = Boolean(
    analysis?.riskReport?.allergyConflicts?.directAllergyMatch
  );

  if (riskLevel === 'Safe') {
    return {
      badge: 'SAFE',
      heading: 'No major safety concern found',
      plainInstruction:
        'No major personalized safety concern was found from your saved health information.',
      action: 'You can continue as prescribed',
      support:
        'Follow the medicine label or your doctor’s instructions and watch for any new symptoms.',
    };
  }

  if (riskLevel === 'Dangerous') {
    return {
      badge: 'DANGEROUS',
      heading: directAllergy
        ? 'Allergy conflict detected'
        : 'Important safety concern detected',
      plainInstruction: directAllergy
        ? 'This medicine conflicts with allergy information saved in your health profile.'
        : 'This medicine has an important safety concern that should be reviewed before use.',
      action: 'Do not take until reviewed',
      support:
        'Please speak with a doctor or pharmacist before taking this medicine.',
    };
  }

  return {
    badge: 'CAUTION',
    heading: 'Review recommended',
    plainInstruction:
      'We found information that may need attention before you take this medicine.',
    action: 'Ask a pharmacist or doctor first',
    support:
      'This does not necessarily mean the medicine is unsafe, but it should be reviewed.',
  };
};

const getReasonBullets = (card, analysis, riskLevel) => {
  const report = analysis?.riskReport || null;
  const rules = Array.isArray(report?.triggeredRules)
    ? report.triggeredRules
    : Array.isArray(card?.riskFactors)
      ? card.riskFactors
      : [];

  const bullets = [];

  rules.forEach((rule) => {
    const label = String(rule?.factorLabel || '').trim();

    if (!label || rule?.factorType === 'ml_prediction') {
      return;
    }

    bullets.push(label.replace(/\.$/, ''));
  });

  if (!bullets.length && String(riskLevel) === 'Safe') {
    bullets.push(
      'No patient-specific allergy, interaction, reaction, or chronic-condition warning was detected'
    );
  }

  if (!bullets.length) {
    bullets.push(
      'The safety check found information that should be reviewed before taking this medicine'
    );
  }

  return Array.from(new Set(bullets)).slice(0, 4);
};

const getPossibleSideEffects = (analysis) => {
  const knowledge = analysis?.medicationKnowledge || {};

  const normalizeEffects = (source, limit) => {
    if (!Array.isArray(source) || !source.length) {
      return [];
    }

    return Array.from(
      new Set(
        source
          .map((item) => {
            if (typeof item === 'string') {
              return item.trim();
            }

            return String(
              item?.name ||
                item?.sideEffect ||
                item?.effect ||
                item?.reaction ||
                item?.label ||
                ''
            ).trim();
          })
          .filter(Boolean)
      )
    ).slice(0, limit);
  };

  return {
    common: normalizeEffects(
      knowledge?.commonSideEffects ||
        knowledge?.sideEffects ||
        knowledge?.possibleSideEffects ||
        knowledge?.adverseEffects ||
        knowledge?.siderSideEffects ||
        knowledge?.sider?.sideEffects ||
        analysis?.possibleSideEffects,
      12
    ),
    severe: normalizeEffects(knowledge?.severeSideEffects, 5),
  };
};

const getInitials = (profile) => {
  const seed = profile?.caregiverDetails || 'User';
  const parts = String(seed)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length || parts[0] === 'User') {
    return 'U';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
};

const getStepIndex = (route) => {
  if (route === 'profile-edit' || route === 'profile-view') {
    return 1;
  }
  if (route === 'questions') {
    return 2;
  }
  return 3;
};

const getVisibleQuestions = (answers) =>
  QUESTIONS.filter((question) => {
    if (
      (question.key === 'reactionSymptoms' || question.key === 'medicineName') &&
      answers.pastReaction === 'No'
    ) {
      return false;
    }

    return true;
  });

const getQuestionDetailPlaceholder = (questionKey) => {
  if (questionKey === 'medicineName') {
    return 'Enter the medicine name';
  }
  if (questionKey === 'doctorAdvice') {
    return 'Which medicine were you told to avoid?';
  }
  if (questionKey === 'painkillerAntibioticReaction') {
    return 'Which medicine, if you remember?';
  }

  return 'Add details';
};

const medicineReactionOptions = [
  'Skin rash',
  'Swelling',
  'Breathing difficulty',
  'Vomiting',
  'Dizziness',
  'Other',
];

const medicineSeverityOptions = [
  { key: 'mild', label: 'Mild' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'severe', label: 'Severe' },
  { key: 'not_sure', label: 'Not sure' },
];

export default function MedicineSafetyScreen({ onBack, initialRoute = 'home' }) {
  const [route, setRoute] = useState(initialRoute);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [profile, setProfile] = useState(emptyProfile);
  const [answers, setAnswers] = useState(normalizeAnswers());
  const [medicineInput, setMedicineInput] = useState(emptyInput);
  const [medicineCheck, setMedicineCheck] = useState(emptyCheck);
  const [cards, setCards] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [medicineSuggestions, setMedicineSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showSideEffects, setShowSideEffects] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceDiagnostic, setVoiceDiagnostic] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const voiceListenerRefs = useRef([]);
  const latestSuggestionQueryRef = useRef('');

  useEffect(() => {
    setRoute(initialRoute);
  }, [initialRoute]);

  useEffect(() => {
    return () => {
      const Speech = getExpoSpeech();
      try {
        Speech?.stop?.();
      } catch {
        // Ignore TTS cleanup issues.
      }

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
    const load = async () => {
      try {
        const [savedProfile, questionnaire, savedCards, savedHistory] = await Promise.all([
          allergyService.getProfile(),
          allergyService.getQuestionnaire(),
          allergyService.getCards(),
          allergyService.getHistory(),
        ]);

        setProfile({ ...emptyProfile, ...savedProfile });
        setAnswers(normalizeAnswers(questionnaire));
        setCards(savedCards);
        setHistory(savedHistory);
      } catch (error) {
        Alert.alert('Load failed', errorText(error, 'Could not load medicine safety.'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(answers),
    [answers]
  );

  useEffect(() => {
    if (questionIndex >= visibleQuestions.length) {
      setQuestionIndex(Math.max(visibleQuestions.length - 1, 0));
    }
  }, [questionIndex, visibleQuestions.length]);

  const historyItems = useMemo(
    () =>
      history.map((item) => ({
        ...item,
        card: cards.find(
          (card) =>
            String(card.medicineName || '').toLowerCase() === String(item.medicineName || '').toLowerCase()
        ),
      })),
    [history, cards]
  );

  const filteredMedicineSuggestions = useMemo(() => {
    const query = String(medicineInput.medicineName || '').trim().toLowerCase();
    const seen = new Set();

    return medicineSuggestions.filter((item) => {
      const name = String(item?.name || '').trim();
      if (!name) {
        return false;
      }

      const normalizedName = name.toLowerCase();
      if (normalizedName === query) {
        return false;
      }

      if (seen.has(normalizedName)) {
        return false;
      }

      seen.add(normalizedName);
      return true;
    });
  }, [medicineInput.medicineName, medicineSuggestions]);

  const currentQuestion = visibleQuestions[questionIndex];

  const speechRecognitionAvailable = useMemo(
    () => Boolean(getExpoSpeechRecognitionModule()),
    []
  );

  const selectMedicineSuggestion = (item, source = medicineInput.inputMethod || 'manual') => {
    setMedicineInput((prev) => ({
      ...prev,
      inputMethod: source,
      medicineName: item.displayName || item.name,
      normalizedDrugName:
        item.normalizedDrugName ||
        item.normalizedName ||
        item.ingredientName ||
        item.name ||
        '',
    }));
    setMedicineSuggestions([]);
  };

  const stopReadingAloud = async () => {
    const Speech = getExpoSpeech();
    try {
      await Speech?.stop?.();
    } catch {
      // Ignore stop failures.
    }
    setIsReadingAloud(false);
  };

  const speakText = async (text) => {
    const Speech = getExpoSpeech();
    if (!Speech?.speak) {
      Alert.alert('Read aloud unavailable', 'Text-to-speech is not available in this build.');
      return;
    }

    if (isReadingAloud) {
      await stopReadingAloud();
      return;
    }

    const message = String(text || '').trim();
    if (!message) {
      return;
    }

    setIsReadingAloud(true);
    Speech.speak(message, {
      language: 'en-US',
      rate: 0.92,
      pitch: 1.0,
      onDone: () => setIsReadingAloud(false),
      onStopped: () => setIsReadingAloud(false),
      onError: () => setIsReadingAloud(false),
    });
  };

  const openMedicineFlow = () => {
    if (!profileComplete(profile)) {
      setRoute('profile-edit');
      return;
    }
    setRoute('check-input');
  };

  useEffect(() => {
    const query = medicineInput.medicineName.trim();
    latestSuggestionQueryRef.current = query;

    if (route !== 'check-input') {
      return;
    }

    if (query.length < 3) {
      setMedicineSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    setSuggestionsLoading(true);

    const timer = setTimeout(async () => {
      try {
        const suggestions = await allergyService.fetchMedicineSuggestions(query);
        if (cancelled || latestSuggestionQueryRef.current !== query) {
          return;
        }

        setMedicineSuggestions(suggestions);
      } catch {
        if (!cancelled) {
          setMedicineSuggestions([]);
        }
      } finally {
        if (!cancelled && latestSuggestionQueryRef.current === query) {
          setSuggestionsLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [medicineInput.medicineName, route]);

  const saveProfile = async () => {
    const cleanedProfile = sanitizeProfilePayload(profile);

    if (!profileComplete(cleanedProfile)) {
      Alert.alert('Missing details', 'Please fill age, gender, and medicine allergy history.');
      return;
    }

    const age = Number(cleanedProfile.age);
    if (!Number.isInteger(age) || age < 18 || age > 120) {
      Alert.alert('Check age', 'Please enter a valid age.');
      return;
    }

    if (cleanedProfile.hasMedicineAllergy === true && !cleanedProfile.knownAllergiesText) {
      Alert.alert(
        'Add allergy details',
        'Please enter the known medicine allergy, or note that you do not know the medicine name.'
      );
      return;
    }

    const hasCaregiverEmail = Boolean(cleanedProfile.caregiverEmail);
    const hasCaregiverPhone = Boolean(cleanedProfile.caregiverPhone);

    if (hasCaregiverEmail !== hasCaregiverPhone) {
      Alert.alert(
        'Incomplete caregiver contact',
        'Please enter both caregiver email and caregiver phone, or leave both fields empty.'
      );
      return;
    }

    if (hasCaregiverEmail && !isValidEmail(cleanedProfile.caregiverEmail)) {
      Alert.alert('Check caregiver email', 'Please enter a valid caregiver email address.');
      return;
    }

    if (hasCaregiverPhone && !isValidPhone(cleanedProfile.caregiverPhone)) {
      Alert.alert('Check caregiver phone', 'Please enter a caregiver phone number with exactly 10 digits.');
      return;
    }

    try {
      setSaving(true);
      const saved = await allergyService.saveProfile(cleanedProfile);
      setProfile({ ...emptyProfile, ...saved });
      setRoute('check-input');
    } catch (error) {
      Alert.alert('Save failed', errorText(error, 'Could not save health profile.'));
    } finally {
      setSaving(false);
    }
  };

  const saveQuestionnaire = async () => {
    const payload = QUESTIONS.map((question) => ({
      questionKey: question.key,
      answerText: answers[question.detailKey]
        ? `${answers[question.key]}: ${answers[question.detailKey]}`
        : answers[question.key] || '',
    }));

    const missingRequiredDetail =
      (answers.pastReaction !== 'No' &&
        answers.reactionSymptoms === 'Other' &&
        !answers.reactionSymptomsDetail?.trim()) ||
      (answers.medicineName === 'Yes' &&
        !answers.medicineNameDetail?.trim()) ||
      (answers.doctorAdvice === 'Yes' &&
        !answers.doctorAdviceDetail?.trim()) ||
      (answers.painkillerAntibioticReaction === 'Yes' &&
        !answers.painkillerAntibioticReactionDetail?.trim());

    if (
      visibleQuestions.some((question) => !answers[question.key]) ||
      missingRequiredDetail
    ) {
      Alert.alert(
        'Incomplete',
        'Please answer all allergy questions and add the requested details.'
      );
      return;
    }

    try {
      setSaving(true);
      const saved = await allergyService.saveQuestionnaire(payload);
      setAnswers(normalizeAnswers(saved));
      setRoute('check-input');
    } catch (error) {
      Alert.alert('Save failed', errorText(error, 'Could not save allergy answers.'));
    } finally {
      setSaving(false);
    }
  };

  const checkMedicine = async () => {
    const cleanedInput = sanitizeMedicineInput(medicineInput);
    const cleanedCheck = sanitizeMedicineCheck(medicineCheck);

    if (!cleanedInput.medicineName) {
      Alert.alert(
        'Missing medicine',
        'Please type the medicine name first.'
      );
      return;
    }

    if (!isValidMedicineName(cleanedInput.medicineName)) {
      Alert.alert(
        'Check medicine name',
        'Please enter a real medicine name with at least 2 letters.'
      );
      return;
    }

    if (cleanedInput.dose && cleanedInput.dose.length < 2) {
      Alert.alert('Check dose', 'Please enter a clearer dose, such as 500 mg.');
      return;
    }

    if (cleanedInput.frequency && cleanedInput.frequency.length < 3) {
      Alert.alert('Check frequency', 'Please enter a clearer frequency, such as Twice a day.');
      return;
    }

    const requiresReactionHistory = cleanedCheck.takenBefore !== false;

    if (
      cleanedCheck.takenBefore === null ||
      (requiresReactionHistory && cleanedCheck.hadReactionBefore === null) ||
      cleanedCheck.takingOtherMedicinesNow === null
    ) {
      Alert.alert(
        'Incomplete',
        'Please answer the medicine questions before checking safety.'
      );
      return;
    }

    if (cleanedCheck.hadReactionBefore === true) {
      if (!cleanedCheck.symptomMatch) {
        Alert.alert(
          'Add reaction details',
          'Please choose what reaction happened with this medicine before.'
        );
        return;
      }

      if (cleanedCheck.symptomMatch === 'Other' && !cleanedCheck.symptomDetail) {
        Alert.alert(
          'Add reaction details',
          'Please describe the reaction if you selected Other.'
        );
        return;
      }

      if (!cleanedCheck.severity) {
        Alert.alert(
          'Add severity',
          'Please choose how serious the reaction was.'
        );
        return;
      }
    }

    try {
      setRoute('loading');

      const result = await allergyService.analyzeMedicine({
        ...cleanedInput,
        ...cleanedCheck,
        symptomMatch:
          cleanedCheck.symptomMatch === 'Other'
            ? cleanedCheck.symptomDetail
            : cleanedCheck.symptomMatch,
        takenBefore:
          cleanedCheck.takenBefore === 'unknown'
            ? null
            : cleanedCheck.takenBefore,
        hadReactionBefore:
          !requiresReactionHistory
            ? false
            : cleanedCheck.hadReactionBefore === 'unknown'
              ? null
              : cleanedCheck.hadReactionBefore,
        takingOtherMedicinesNow:
          cleanedCheck.takingOtherMedicinesNow === 'unknown'
            ? null
            : cleanedCheck.takingOtherMedicinesNow,
        severity:
          cleanedCheck.severity === 'not_sure'
            ? 'unknown'
            : cleanedCheck.severity || null,
        normalizedDrugName: cleanedInput.normalizedDrugName || '',
      });

      setLatestResult(result);
      setCards((prev) => [
        result.card,
        ...prev.filter((item) => item.id !== result.card.id),
      ]);
      setHistory(await allergyService.getHistory());
      setSelectedCard(result.card);
      setMedicineInput(emptyInput);
      setMedicineCheck(emptyCheck);
      setShowTechnicalDetails(false);
      setShowSideEffects(false);
      setRoute('result');
    } catch (error) {
      Alert.alert('Check failed', errorText(error, 'Could not check medicine safety.'));
      setRoute('check-questions');
    }
  };

  const runOcrOnPickedImage = async (uri, mimeType) => {
    try {
      setLoading(true);
      const { rawText } = await extractPrescriptionTextFromImage(uri, mimeType);
      const detectedName = firstNonEmptyLine(rawText);

      if (!detectedName) {
        Alert.alert(
          'No medicine found',
          'The photo was captured, but no medicine name could be read clearly. Please edit the name manually.'
        );
        return;
      }

      setMedicineInput((prev) => ({
        ...prev,
        inputMethod: 'scan',
        medicineName: detectedName,
        normalizedDrugName: '',
      }));
      setMedicineSuggestions([]);

      Alert.alert('Scan complete', `Detected medicine: ${detectedName}`);
    } catch (error) {
      Alert.alert('Scan failed', errorMessage(error, 'Could not scan this prescription image.'));
    } finally {
      setLoading(false);
    }
  };

  const startCameraScanFlow = async () => {
    const ImagePicker = getExpoImagePicker();

    if (!ImagePicker?.launchCameraAsync) {
      Alert.alert(
        'Camera unavailable',
        'This build does not include the native camera module yet. Rebuild the app with expo-image-picker enabled.'
      );
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to scan a prescription.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        allowsEditing: true,
      });

      if (result?.canceled) {
        return;
      }

      const asset = result?.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('No image', 'Could not read the captured image. Please try again.');
        return;
      }

      await runOcrOnPickedImage(asset.uri, asset.mimeType || 'image/jpeg');
    } catch (error) {
      Alert.alert('Camera error', errorMessage(error, 'Could not open the camera.'));
    }
  };

  const startGalleryScanFlow = async () => {
    const ImagePicker = getExpoImagePicker();

    if (!ImagePicker?.launchImageLibraryAsync) {
      Alert.alert(
        'Photo library unavailable',
        'This build does not include the native photo library module yet. Rebuild the app with expo-image-picker enabled.'
      );
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert('Permission needed', 'Please allow photo access to scan a prescription image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
      });

      if (result?.canceled) {
        return;
      }

      const asset = result?.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('No image', 'Could not read the selected image. Please try again.');
        return;
      }

      await runOcrOnPickedImage(asset.uri, asset.mimeType || 'image/jpeg');
    } catch (error) {
      Alert.alert('Photo error', errorMessage(error, 'Could not open the photo library.'));
    }
  };

  const openScanOptions = () => {
    Alert.alert(
      'Scan medicine',
      'Choose how you want to provide the prescription image.',
      [
        { text: 'Camera', onPress: startCameraScanFlow },
        { text: 'Gallery', onPress: startGalleryScanFlow },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
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
      // Ignore stop failures.
    }

    setIsVoiceListening(false);
  };

  const startVoiceRecognition = async () => {
    setVoiceError('');
    setVoiceDiagnostic('');

    const SpeechRecognition = getExpoSpeechRecognitionModule();
    if (!SpeechRecognition) {
      Alert.alert(
        'Voice unavailable',
        'This build does not include native speech recognition yet. Rebuild the app with expo-speech-recognition enabled.'
      );
      return;
    }

    if (!ExpoEventEmitter) {
      setVoiceError('Voice listener API is unavailable in this build.');
      return;
    }

    if (voiceListenerRefs.current.length === 0) {
      const speechEventEmitter = new ExpoEventEmitter(SpeechRecognition);

      const resultSub = speechEventEmitter.addListener('result', (event) => {
        const transcript = String(event?.results?.[0]?.transcript || '').trim();
        const detectedName = getDetectedMedicineCandidate(event);
        const candidate = cleanVoiceMedicineQuery(detectedName || transcript);

        if (transcript) {
          setVoiceTranscript(transcript);
        }

        if (candidate) {
          setMedicineInput((prev) => ({
            ...prev,
            inputMethod: 'voice',
            medicineName: candidate,
            normalizedDrugName: '',
          }));
          setVoiceDiagnostic(`We heard "${candidate}". Please verify the medicine name below.`);
        } else if (event?.isFinal) {
          setVoiceError('Medicine not recognized. Please say only the medicine name and try again.');
        }
      });

      const startSub = speechEventEmitter.addListener('start', () => {
        setIsVoiceListening(true);
        setVoiceDiagnostic('Listening. Say only the medicine name, for example: Paracetamol.');
      });

      const endSub = speechEventEmitter.addListener('end', () => {
        setIsVoiceListening(false);
        setVoiceDiagnostic('Voice capture finished.');
      });

      const errorSub = speechEventEmitter.addListener('error', (event) => {
        const code = event?.error || 'unknown';
        setIsVoiceListening(false);
        setVoiceError(`Voice recognition error: ${code}`);
      });

      voiceListenerRefs.current = [resultSub, startSub, endSub, errorSub];
    }

    try {
      const permission = await SpeechRecognition.requestPermissionsAsync();
        if (!permission?.granted) {
          Alert.alert('Permission needed', 'Please allow microphone access to use voice input.');
          return;
        }

      if (
        Platform.OS === 'android' &&
        typeof SpeechRecognition.getSpeechRecognitionServices === 'function'
      ) {
        const services = SpeechRecognition.getSpeechRecognitionServices();
        if (Array.isArray(services) && services.length === 0) {
          Alert.alert(
            'Voice service missing',
            'No speech recognition service is installed on this device. Please enable the Google speech service.'
          );
          return;
        }
      }

      await SpeechRecognition.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch (error) {
      setIsVoiceListening(false);
      setVoiceError(errorMessage(error, 'Could not start voice recognition.'));
    }
  };

  const renderHeader = (title, subtitle) => (
    <View style={styles.topBar}>
      <TouchableOpacity
        style={styles.backIcon}
        onPress={
          route === 'home'
            ? onBack
            : () => setRoute('home')
        }
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Text style={styles.backIconText}>‹</Text>
      </TouchableOpacity>
      <View style={styles.topBarTextWrap}>
        <Text style={styles.topBarTitle}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.topBarSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  const renderStepper = (activeStep) => (
    <View style={styles.stepperWrap}>
      {[
        { number: 1, label: 'Profile' },
        { number: 2, label: 'Questions' },
        { number: 3, label: 'Check' },
      ].map((step, index, list) => {
        const active = activeStep === step.number;
        const complete = activeStep > step.number;
        return (
          <React.Fragment key={step.number}>
            <View style={styles.stepperItem}>
              <View style={[styles.stepperCircle, (active || complete) && styles.stepperCircleActive]}>
                <Text style={[styles.stepperCircleText, (active || complete) && styles.stepperCircleTextActive]}>
                  {step.number}
                </Text>
              </View>
              <Text style={[styles.stepperLabel, active && styles.stepperLabelActive]}>{step.label}</Text>
            </View>
            {index < list.length - 1 ? <View style={styles.stepperLine} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );

  const renderOptionCard = (label, active, onPress) => (
    <TouchableOpacity style={[styles.optionCard, active && styles.optionCardActive]} onPress={onPress}>
      <View style={[styles.optionRadio, active && styles.optionRadioActive]}>
        {active ? <Text style={styles.optionRadioCheck}>OK</Text> : null}
      </View>
      <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderResultCard = (card, analysis = null) => {
    const risk = String(
      analysis?.riskReport?.classification?.riskLevel ||
      card?.riskLevel ||
      'Warning'
    );
    const displayRisk = displayRiskLevel(risk);
    const riskCopy = getRiskCopy(risk, analysis);
    const reasonBullets = getReasonBullets(
      card,
      analysis,
      risk
    );
    const mlPrediction = analysis?.mlPrediction || analysis?.medicationKnowledge?.mlPrediction || null;
    const mlProbability = formatPercent(mlPrediction?.adrRiskProbability ?? mlPrediction?.probability);
    const ruleScore = toFiniteNumber(analysis?.dataUsed?.ruleScore);
    const finalScore = toFiniteNumber(
      analysis?.riskReport?.classification?.finalScore ??
      card?.riskScore
    );
    const triggeredRules = analysis?.dataUsed?.ruleEngine?.triggeredRuleIds || [];
    const allergyEvidenceMatches = analysis?.dataUsed?.allergyEvidenceMatches || [];
    const guardrail =
      analysis?.dataUsed?.hybridGuardrailApplied || null;
    const possibleSideEffects =
      getPossibleSideEffects(analysis);

    const isDangerous = risk === 'Dangerous';
    const isSafe = risk === 'Safe';

    const statusCardStyle = isDangerous
      ? styles.resultDanger
      : isSafe
        ? styles.resultSafe
        : styles.resultCaution;

    const statusTextStyle = isDangerous
      ? styles.resultDangerText
      : isSafe
        ? styles.resultSafeText
        : styles.resultCautionText;
    const resultReadAloudText = [
      `${card?.medicineName || 'Medicine'}.`,
      `${displayRisk}.`,
      riskCopy.heading,
      riskCopy.plainInstruction,
      `What should I do? ${riskCopy.action}.`,
      card?.recommendation || riskCopy.support,
    ].filter(Boolean).join(' ');
    const sideEffectsReadAloudText = [
      `Possible side effects for ${card?.medicineName || 'this medicine'}.`,
      possibleSideEffects.common.length
        ? `Common or reported effects: ${possibleSideEffects.common.join(', ')}.`
        : '',
      possibleSideEffects.severe.length
        ? `Serious reported effects: ${possibleSideEffects.severe.join(', ')}.`
        : '',
    ].filter(Boolean).join(' ');

    return (
      <>
        <View style={styles.medicineHeaderRow}>
          <View style={styles.medicineHeaderTextWrap}>
            <Text style={styles.eyebrow}>
              MEDICINE SAFETY CHECK
            </Text>

            <Text style={styles.medicineHeading}>
              {card?.medicineName || 'Medicine'}
            </Text>
          </View>

          <View
            style={[
              styles.riskChip,
              isDangerous
                ? styles.riskChipDanger
                : isSafe
                  ? styles.riskChipSafe
                  : styles.riskChipCaution,
            ]}
          >
            <Text
              style={[
                styles.riskChipText,
                isDangerous
                  ? styles.riskChipTextDanger
                  : isSafe
                    ? styles.riskChipTextSafe
                    : styles.riskChipTextCaution,
              ]}
            >
              {displayRisk}
            </Text>
          </View>
        </View>

        <View style={[styles.resultCardModern, statusCardStyle]}>
          <View
            style={[
              styles.resultIconModern,
              isDangerous
                ? styles.resultIconDangerModern
                : isSafe
                  ? styles.resultIconSafeModern
                  : styles.resultIconCautionModern,
            ]}
          >
            <Text
              style={[
                styles.resultIconModernText,
                statusTextStyle,
              ]}
            >
              {isSafe ? '✓' : isDangerous ? '!' : 'i'}
            </Text>
          </View>

          <View style={styles.resultModernBody}>
            <Text style={styles.resultSmallLabel}>
              YOUR RESULT
            </Text>

            <Text
              style={[
                styles.resultModernTitle,
                statusTextStyle,
              ]}
            >
              {riskCopy.heading}
            </Text>

            <Text
              style={[
                styles.resultModernDescription,
                statusTextStyle,
              ]}
            >
              {riskCopy.plainInstruction}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.readAloudButton}
          onPress={() => speakText(resultReadAloudText)}
        >
          <Text style={styles.readAloudText}>
            {isReadingAloud ? 'Stop reading' : 'Read this result aloud'}
          </Text>
        </TouchableOpacity>

        <View style={styles.modernInfoCard}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionIconCircle}>
              <Text style={styles.sectionIconText}>?</Text>
            </View>

            <Text style={styles.modernSectionTitle}>
              Why this result
            </Text>
          </View>

          {reasonBullets.map((bullet, index) => (
            <View
              key={`${bullet}-${index}`}
              style={styles.modernBulletRow}
            >
              <View style={styles.modernBulletDot} />

              <Text style={styles.modernBulletText}>
                {bullet}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sideEffectsCard}>
          <TouchableOpacity
            style={styles.sideEffectsHeader}
            onPress={() => setShowSideEffects((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={
              showSideEffects
                ? 'Hide possible side effects'
                : 'Show possible side effects'
            }
          >
            <View style={styles.sideEffectsHeaderLeft}>
              <View style={styles.sideEffectsIcon}>
                <Text style={styles.sideEffectsIconText}>
                  i
                </Text>
              </View>

              <View style={styles.sideEffectsTitleWrap}>
                <Text style={styles.sideEffectsTitle}>
                  Possible side effects
                </Text>

                <Text style={styles.sideEffectsSubtitle}>
                  General information about this medicine
                </Text>
              </View>
            </View>

            <Text style={styles.sideEffectsChevron}>
              {showSideEffects ? '⌃' : '⌄'}
            </Text>
          </TouchableOpacity>

          {showSideEffects ? (
            <View style={styles.sideEffectsContent}>
              <TouchableOpacity
                style={styles.inlineReadButton}
                onPress={() => speakText(sideEffectsReadAloudText)}
              >
                <Text style={styles.inlineReadButtonText}>
                  {isReadingAloud ? 'Stop reading' : 'Read side effects aloud'}
                </Text>
              </TouchableOpacity>

              <View style={styles.sideEffectsNotice}>
                <Text style={styles.sideEffectsNoticeText}>
                  These are possible reported effects of this medicine. They do not mean you will
                  experience them.
                </Text>
              </View>

              {possibleSideEffects.common.length ? (
                <>
                  <Text style={styles.sideEffectsSectionTitle}>
                    Common or reported effects
                  </Text>

                  {possibleSideEffects.common.map((effect, index) => (
                    <View
                      key={`${effect}-${index}`}
                      style={styles.sideEffectRow}
                    >
                      <View style={styles.sideEffectBullet} />

                      <Text style={styles.sideEffectText}>
                        {effect}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              {possibleSideEffects.severe.length ? (
                <>
                  <Text style={styles.sideEffectsSectionTitle}>
                    Serious reported effects
                  </Text>

                  {possibleSideEffects.severe.map((effect, index) => (
                    <View
                      key={`severe-${effect}-${index}`}
                      style={styles.sideEffectRow}
                    >
                      <View style={[styles.sideEffectBullet, styles.sideEffectBulletSevere]} />

                      <Text style={styles.sideEffectText}>
                        {effect}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              {!possibleSideEffects.common.length && !possibleSideEffects.severe.length ? (
                <Text style={styles.sideEffectsEmpty}>
                  No side-effect information is available for this medicine in the current
                  knowledge source.
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.actionAdviceCard,
            isDangerous
              ? styles.actionAdviceDanger
              : isSafe
                ? styles.actionAdviceSafe
                : styles.actionAdviceCaution,
          ]}
        >
          <View style={styles.actionAdviceHeader}>
            <View
              style={[
                styles.actionAdviceIcon,
                isDangerous
                  ? styles.actionAdviceIconDanger
                  : isSafe
                    ? styles.actionAdviceIconSafe
                    : styles.actionAdviceIconCaution,
              ]}
            >
              <Text
                style={[
                  styles.actionAdviceIconText,
                  statusTextStyle,
                ]}
              >
                {isSafe ? '✓' : isDangerous ? '!' : 'i'}
              </Text>
            </View>

            <Text style={styles.actionAdviceLabel}>
              What should I do?
            </Text>
          </View>

          <Text
            style={[
              styles.actionAdviceMain,
              statusTextStyle,
            ]}
          >
            {riskCopy.action}
          </Text>

          <Text
            style={[
              styles.actionAdviceSupport,
              statusTextStyle,
            ]}
          >
            {card?.recommendation || 'No recommendation available.'}
          </Text>
        </View>

        <View style={styles.simpleSummaryCard}>
          <Text style={styles.simpleSummaryTitle}>
            Simple summary
          </Text>

          <Text style={styles.simpleSummaryText}>
            {`${displayRisk}. ${riskCopy.heading}. ${riskCopy.support}`}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.technicalToggleModern}
          onPress={() => setShowTechnicalDetails((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={
            showTechnicalDetails
              ? 'Hide details for doctor or carer'
              : 'Show details for doctor or carer'
          }
        >
          <View>
            <Text style={styles.technicalToggleModernTitle}>
              Details for doctor or carer
            </Text>

            <Text style={styles.technicalToggleModernSub}>
              Scores, clinical rules and technical evidence
            </Text>
          </View>

          <Text style={styles.technicalChevron}>
            {showTechnicalDetails ? '⌃' : '⌄'}
          </Text>
        </TouchableOpacity>

        {showTechnicalDetails ? (
          <View style={styles.technicalCardModern}>
            <Text style={styles.technicalHeading}>
              Technical details
            </Text>

            {finalScore != null ? (
              <View style={styles.technicalRow}>
                <Text style={styles.technicalLabel}>
                  Final risk score
                </Text>

                <Text style={styles.technicalValue}>
                  {finalScore}/100
                </Text>
              </View>
            ) : null}

            {ruleScore != null ? (
              <View style={styles.technicalRow}>
                <Text style={styles.technicalLabel}>
                  Clinical rule score
                </Text>

                <Text style={styles.technicalValue}>
                  {ruleScore}/100
                </Text>
              </View>
            ) : null}

            {mlProbability ? (
              <View style={styles.technicalRowColumn}>
                <Text style={styles.technicalLabel}>
                  FDA-report serious-event signal
                </Text>

                <Text style={styles.technicalValueLarge}>
                  {mlProbability}
                </Text>

                <Text style={styles.populationLabel}>
                  Population-level signal
                </Text>
              </View>
            ) : null}

            {triggeredRules.length ? (
              <View style={styles.technicalRowColumn}>
                <Text style={styles.technicalLabel}>
                  Triggered clinical rules
                </Text>

                <Text style={styles.technicalValueText}>
                  {triggeredRules.join(', ')}
                </Text>
              </View>
            ) : null}

            {allergyEvidenceMatches.length ? (
              <View style={styles.technicalRowColumn}>
                <Text style={styles.technicalLabel}>
                  Allergy evidence
                </Text>

                <Text style={styles.technicalValueText}>
                  {allergyEvidenceMatches
                    .map(
                      (item) =>
                        item.label ||
                        item.sourceKey
                    )
                    .join(', ')}
                </Text>
              </View>
            ) : null}

            {guardrail ? (
              <View style={styles.technicalRowColumn}>
                <Text style={styles.technicalLabel}>
                  Safety guardrail
                </Text>

                <Text style={styles.technicalValueText}>
                  {String(guardrail).replace(/_/g, ' ')}
                </Text>
              </View>
            ) : null}

            <View style={styles.mlDisclaimerBox}>
              <Text style={styles.mlDisclaimerTitle}>
                About the ML value
              </Text>

              <Text style={styles.mlDisclaimerText}>
                This value is a population-level
                pharmacovigilance signal derived from
                adverse-event reports. It is not an
                individual probability that this medicine
                will harm this patient.
              </Text>
            </View>

            {card?.explanation ? (
              <Text style={styles.technicalExplanation}>
                {cleanExplanation(card.explanation)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </>
    );
  };

  if (loading || route === 'loading') {
    return (
      <View style={styles.screen}>
        {renderHeader(route === 'loading' ? 'Checking Safety' : 'Medicine Safety')}
        <View style={styles.centerArea}>
          <ActivityIndicator size="large" color={COLORS.green} />
          <Text style={styles.loadingTitle}>Checking medicine safety...</Text>
          <Text style={styles.loadingText}>Looking for allergy risk and interactions.</Text>
          <View style={styles.loadingCard}>
            {[
              'Checking your profile',
              'Checking allergies',
              'Checking medicine information',
              'Running safety rules',
              'Estimating risk with AI',
            ].map((item, index) => (
              <View key={item} style={styles.loadingRow}>
                <View style={[styles.loadingDot, index < 4 && styles.loadingDotDone]} />
                <Text style={styles.loadingRowText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (route === 'home') {
    return (
      <View style={styles.screen}>
        {renderHeader('Medicine Safety')}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.heroCard}>
            <View style={styles.heroIntroCard}>
              <View style={styles.helloBadge}>
              <Text style={styles.helloBadgeText}>Hello</Text>
            </View>
            <Text style={styles.heroTitle}>{getGreeting()}</Text>
            <Text style={styles.heroSubtitle}>
              Check medicines against your health profile,
              allergies and current treatment.
            </Text>
          </View>
          <View style={styles.profileCircle}>
            <Text style={styles.profileCircleText}>{getInitials(profile)}</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.actionCard, styles.actionPrimary]} onPress={openMedicineFlow}>
            <View style={[styles.actionIconWrap, styles.actionGreen]}>
              <Text style={styles.actionIcon}>💊</Text>
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={[styles.actionTitle, styles.actionPrimaryText]}>Check a Medicine</Text>
              <Text style={[styles.actionSubtitle, styles.actionPrimarySub]}>
                Check personalized medicine safety
              </Text>
            </View>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => setRoute('profile-view')}>
            <View style={[styles.actionIconWrap, styles.actionBlue]}>
              <Text style={styles.actionIcon}>👤</Text>
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>My Profile</Text>
              <Text style={styles.actionSubtitle}>Allergies, conditions and current medicines</Text>
            </View>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => setRoute('history')}>
            <View style={[styles.actionIconWrap, styles.actionOrange]}>
              <Text style={styles.actionIcon}>🕘</Text>
            </View>
            <View style={styles.actionTextWrap}>
              <Text style={styles.actionTitle}>Safety History</Text>
              <Text style={styles.actionSubtitle}>Review previous safety checks</Text>
            </View>
            <Text style={styles.actionChevron}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'profile-view') {
    return (
      <View style={styles.screen}>
        {renderHeader('My Profile')}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.profileHeader}>
            <View style={styles.bigProfileCircle}>
              <Text style={styles.bigProfileCircleText}>{getInitials(profile)}</Text>
            </View>
            <Text style={styles.profileName}>Health Profile</Text>
            <Text style={styles.profileMeta}>{`Age ${profile.age || '--'} | ${profile.gender || '--'}`}</Text>
          </View>

          {[
            ['Known Allergies', profile.knownAllergiesText || 'Not added yet'],
            ['Chronic Conditions', profile.chronicDiseasesText || 'Not added yet'],
            ['Current Medicines', profile.currentMedicationsText || 'Not added yet'],
            ['Caregiver Email', profile.caregiverEmail || 'Not added yet'],
            ['Caregiver Phone', profile.caregiverPhone || 'Not added yet'],
          ].map(([label, value]) => (
            <View key={label} style={styles.profileInfoRow}>
              <Text style={styles.profileInfoLabel}>{label}</Text>
              <Text style={styles.profileInfoValue}>{value}</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.primaryButton} onPress={() => setRoute('profile-edit')}>
            <Text style={styles.primaryButtonText}>Update Profile</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'profile-edit') {
    return (
      <View style={styles.screen}>
        {renderHeader('Health Profile')}
        <ScrollView contentContainerStyle={styles.content}>
          {renderStepper(getStepIndex(route))}
          <Text style={styles.sectionLead}>Collect only the key details needed before medicine checks.</Text>

          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput
            style={styles.input}
            value={profile.age}
            onChangeText={(value) => setProfile((prev) => ({ ...prev, age: value }))}
            placeholder="Age"
            keyboardType="numeric"
          />

          <Text style={styles.fieldLabel}>Sex</Text>
          <View style={styles.choiceRow}>
            {['Male', 'Female', 'Other'].map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.choiceChip, profile.gender === value && styles.choiceChipActive]}
                onPress={() => setProfile((prev) => ({ ...prev, gender: value }))}
              >
                <Text style={[styles.choiceChipText, profile.gender === value && styles.choiceChipTextActive]}>
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Medicine allergy history</Text>
          <View style={styles.choiceRow}>
            {[
              { label: 'Allergy Yes', value: true },
              { label: 'Allergy No', value: false },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.choiceChip, profile.hasMedicineAllergy === item.value && styles.choiceChipActive]}
                onPress={() =>
                  setProfile((prev) => ({
                    ...prev,
                    hasMedicineAllergy: item.value,
                    knownAllergiesText: item.value ? prev.knownAllergiesText : '',
                  }))
                }
              >
                <Text
                  style={[
                    styles.choiceChipText,
                    profile.hasMedicineAllergy === item.value && styles.choiceChipTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {profile.hasMedicineAllergy === true ? (
            <>
              <Text style={styles.fieldLabel}>Known allergies</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={profile.knownAllergiesText}
                onChangeText={(value) => setProfile((prev) => ({ ...prev, knownAllergiesText: value }))}
                placeholder="e.g. Penicillin, aspirin"
                multiline
              />
            </>
          ) : null}
          <Text style={styles.fieldLabel}>Chronic conditions</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={profile.chronicDiseasesText}
            onChangeText={(value) => setProfile((prev) => ({ ...prev, chronicDiseasesText: value }))}
            placeholder="e.g. Diabetes, kidney disease"
            multiline
          />
          <Text style={styles.fieldLabel}>Current medicines</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={profile.currentMedicationsText}
            onChangeText={(value) => setProfile((prev) => ({ ...prev, currentMedicationsText: value }))}
            placeholder="e.g. Warfarin, amlodipine"
            multiline
          />
          <Text style={styles.fieldLabel}>Caregiver email</Text>
          <TextInput
            style={styles.input}
            value={profile.caregiverEmail}
            onChangeText={(value) => setProfile((prev) => ({ ...prev, caregiverEmail: value }))}
            placeholder="Caregiver email"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.fieldLabel}>Caregiver phone</Text>
          <TextInput
            style={styles.input}
            value={profile.caregiverPhone}
            onChangeText={(value) => setProfile((prev) => ({ ...prev, caregiverPhone: value }))}
            placeholder="Caregiver phone"
            keyboardType="phone-pad"
          />

          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
            onPress={saveProfile}
            disabled={saving}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save Health Profile'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'questions') {
    const showDetail =
      (currentQuestion.key === 'reactionSymptoms' && answers.reactionSymptoms === 'Other') ||
      (currentQuestion.key === 'medicineName' && answers.medicineName === 'Yes') ||
      (currentQuestion.key === 'doctorAdvice' && answers.doctorAdvice === 'Yes') ||
      (currentQuestion.key === 'painkillerAntibioticReaction' &&
        answers.painkillerAntibioticReaction === 'Yes');

    return (
      <View style={styles.screen}>
        {renderHeader('A Few Questions')}
        <ScrollView contentContainerStyle={styles.content}>
          {renderStepper(getStepIndex(route))}
          <View style={styles.stepDots}>
            {visibleQuestions.map((_, index) => (
              <View key={index} style={[styles.stepDot, index === questionIndex && styles.stepDotActive]} />
            ))}
          </View>

          <View style={styles.questionCard}>
            <Text style={styles.questionSmall}>{`QUESTION ${questionIndex + 1} OF ${visibleQuestions.length}`}</Text>
            <Text style={styles.questionTitle}>{currentQuestion.label}</Text>
            <TouchableOpacity
              style={styles.inlineReadButton}
              onPress={() => speakText(currentQuestion.label)}
            >
              <Text style={styles.inlineReadButtonText}>
                {isReadingAloud ? 'Stop reading' : 'Read question aloud'}
              </Text>
            </TouchableOpacity>
          </View>

          {currentQuestion.options.map((option) =>
            renderOptionCard(option, answers[currentQuestion.key] === option, () =>
              setAnswers((prev) => {
                const next = { ...prev, [currentQuestion.key]: option };

                if (currentQuestion.key === 'pastReaction' && option === 'No') {
                  next.reactionSymptoms = '';
                  next.reactionSymptomsDetail = '';
                  next.medicineName = '';
                  next.medicineNameDetail = '';
                }

                if (currentQuestion.key === 'reactionSymptoms' && option !== 'Other') {
                  next.reactionSymptomsDetail = '';
                }

                if (currentQuestion.key === 'medicineName' && option !== 'Yes') {
                  next.medicineNameDetail = '';
                }

                if (currentQuestion.key === 'doctorAdvice' && option !== 'Yes') {
                  next.doctorAdviceDetail = '';
                }

                if (currentQuestion.key === 'painkillerAntibioticReaction' && option !== 'Yes') {
                  next.painkillerAntibioticReactionDetail = '';
                }

                return next;
              })
            )
          )}

          {showDetail ? (
            <TextInput
              style={[styles.input, styles.textArea]}
              value={answers[currentQuestion.detailKey]}
              onChangeText={(value) => setAnswers((prev) => ({ ...prev, [currentQuestion.detailKey]: value }))}
              placeholder={getQuestionDetailPlaceholder(currentQuestion.key)}
              multiline
            />
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, (!answers[currentQuestion.key] || saving) && styles.primaryButtonDisabled]}
            onPress={
              questionIndex === visibleQuestions.length - 1
                ? saveQuestionnaire
                : () => setQuestionIndex((index) => index + 1)
            }
            disabled={!answers[currentQuestion.key] || saving}
          >
            <Text style={styles.primaryButtonText}>
              {questionIndex === visibleQuestions.length - 1 ? (saving ? 'Saving...' : 'Save Allergy Answers') : 'Next'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'check-input') {
    return (
      <View style={styles.screen}>
        {renderHeader('Enter Medicine')}
        <ScrollView contentContainerStyle={styles.content}>
          {renderStepper(getStepIndex(route))}
          <Text style={styles.formLabel}>Type the medicine name</Text>
          <Text style={styles.formHint}>Write exactly as shown on the packet</Text>

          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              You only need to enter the medicine first. We will ask the medicine-specific safety
              questions after that.
            </Text>
          </View>

          <TextInput
            style={styles.input}
            value={medicineInput.medicineName}
            onChangeText={(value) =>
              setMedicineInput((prev) => ({
                ...prev,
                medicineName: value,
                normalizedDrugName: '',
              }))
            }
            placeholder="e.g. Amoxicillin"
            autoCapitalize="words"
          />

          {suggestionsLoading ? (
            <Text style={styles.voiceInfoText}>Looking for medicine names...</Text>
          ) : null}

          {filteredMedicineSuggestions.length ? (
            <View style={styles.suggestionsCard}>
              {filteredMedicineSuggestions.map((item, index) => (
                <TouchableOpacity
                  key={`${item.id || item.name}-${index}`}
                  style={[
                    styles.suggestionRow,
                    index === filteredMedicineSuggestions.length - 1 && styles.suggestionRowLast,
                  ]}
                  onPress={() => selectMedicineSuggestion(item, medicineInput.inputMethod || 'manual')}
                >
                  <Text style={styles.suggestionTitle}>{item.name}</Text>
                  {item.ingredientName ? (
                    <Text style={styles.suggestionMeta}>{item.ingredientName}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <Text style={styles.orText}>or</Text>

          <View style={styles.utilityGrid}>
            <TouchableOpacity
              style={styles.utilityCardGrid}
              onPress={openScanOptions}
            >
              <Text style={styles.utilityIconBig}>📷</Text>
              <Text style={styles.utilityTitleCentered}>Scan medicine</Text>
              <Text style={styles.utilitySubCentered}>Camera or gallery OCR</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.utilityCardGrid}
              onPress={isVoiceListening ? stopVoiceRecognition : startVoiceRecognition}
            >
              <Text style={styles.utilityIconBig}>🎤</Text>
              <Text style={styles.utilityTitleCentered}>Use voice</Text>
              <Text style={styles.utilitySubCentered}>
                {isVoiceListening
                  ? 'Listening now'
                  : speechRecognitionAvailable
                    ? 'Tap to speak'
                    : 'Rebuild may be needed'}
              </Text>
            </TouchableOpacity>
          </View>

          {voiceDiagnostic ? (
            <Text style={styles.voiceInfoText}>{voiceDiagnostic}</Text>
          ) : null}

          {voiceTranscript ? (
            <Text style={styles.voiceInfoText}>{`We heard: "${voiceTranscript}"`}</Text>
          ) : null}

          {voiceError ? (
            <Text style={styles.voiceErrorText}>{voiceError}</Text>
          ) : null}

          <TextInput
            style={styles.input}
            value={medicineInput.dose}
            onChangeText={(value) => setMedicineInput((prev) => ({ ...prev, dose: value }))}
            placeholder="Dose (e.g. 500 mg)"
          />
          <TextInput
            style={styles.input}
            value={medicineInput.frequency}
            onChangeText={(value) => setMedicineInput((prev) => ({ ...prev, frequency: value }))}
            placeholder="Frequency (e.g. Twice a day)"
          />

          <TouchableOpacity
            style={[
              styles.primaryButton,
              !isValidMedicineName(medicineInput.medicineName) && styles.primaryButtonDisabled,
            ]}
            onPress={() => setRoute('confirm')}
            disabled={!isValidMedicineName(medicineInput.medicineName)}
          >
            <Text style={styles.primaryButtonText}>Review & Confirm</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'confirm') {
    const confirmReadAloudText = `You are checking ${medicineInput.medicineName || 'a medicine'}. Dose: ${medicineInput.dose || 'not provided'}. Frequency: ${medicineInput.frequency || 'not provided'}. Please confirm these details before continuing.`;
    return (
      <View style={styles.screen}>
        {renderHeader('Confirm Medicine')}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.confirmTopCard}>
            <Text style={styles.confirmTopText}>Please confirm the medicine details below.</Text>
            <TouchableOpacity
              style={styles.inlineReadButton}
              onPress={() => speakText(confirmReadAloudText)}
            >
              <Text style={styles.inlineReadButtonText}>
                {isReadingAloud ? 'Stop reading' : 'Read details aloud'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.confirmLabel}>We found this information:</Text>
          <View style={styles.confirmTable}>
            {[
              ['Medicine', medicineInput.medicineName || 'Not provided'],
              ['Dose', medicineInput.dose || 'Not provided'],
              ['Frequency', medicineInput.frequency || 'Not provided'],
            ].map(([key, value], index, list) => (
              <View key={key} style={[styles.confirmRow, index === list.length - 1 && styles.confirmRowLast]}>
                <Text style={styles.confirmKey}>{key}</Text>
                <Text style={styles.confirmValue}>{value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              Please check carefully. If anything looks wrong, tap Edit to correct it.
            </Text>
          </View>

          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.outlineHalf} onPress={() => setRoute('check-input')}>
              <Text style={styles.outlineHalfText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fillHalf} onPress={() => setRoute('check-questions')}>
              <Text style={styles.fillHalfText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (route === 'check-questions') {
    return (
      <View style={styles.screen}>
        {renderHeader(
          medicineInput.medicineName
            ? `About ${medicineInput.medicineName}`
            : 'About This Medicine',
          'A few quick safety questions'
        )}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.questionCard}>
            <Text style={styles.questionSmall}>QUESTION 1 OF 4</Text>
            <Text style={styles.questionTitle}>
              {`Have you taken ${medicineInput.medicineName || 'this medicine'} before?`}
            </Text>
          </View>

          {[
            { label: 'Yes, I have taken it before', key: true },
            { label: 'No, this is new for me', key: false },
            { label: 'I am not sure', key: 'unknown' },
          ].map((item) =>
            renderOptionCard(item.label, medicineCheck.takenBefore === item.key, () =>
              setMedicineCheck((prev) => ({
                ...prev,
                takenBefore: item.key,
                hadReactionBefore: item.key === false ? false : prev.hadReactionBefore,
                symptomMatch: item.key === false ? '' : prev.symptomMatch,
                symptomDetail: item.key === false ? '' : prev.symptomDetail,
                severity: item.key === false ? '' : prev.severity,
              }))
            )
          )}

          {medicineCheck.takenBefore !== false ? (
            <>
              <View style={styles.questionCard}>
                <Text style={styles.questionSmall}>QUESTION 2 OF 4</Text>
                <Text style={styles.questionTitle}>Have you had a reaction to this medicine before?</Text>
              </View>

              {[
                { label: 'Yes', key: true },
                { label: 'No', key: false },
                { label: 'I am not sure', key: 'unknown' },
              ].map((item) =>
                renderOptionCard(item.label, medicineCheck.hadReactionBefore === item.key, () =>
                  setMedicineCheck((prev) => ({
                    ...prev,
                    hadReactionBefore: item.key,
                    symptomMatch: item.key === true ? prev.symptomMatch : '',
                    symptomDetail: item.key === true ? prev.symptomDetail : '',
                    severity: item.key === true ? prev.severity : '',
                  }))
                )
              )}

              {medicineCheck.hadReactionBefore === true ? (
                <>
                  <View style={styles.questionCard}>
                    <Text style={styles.questionSmall}>QUESTION 3 OF 4</Text>
                    <Text style={styles.questionTitle}>What reaction did you have?</Text>
                  </View>

                  {medicineReactionOptions.map((option) =>
                    renderOptionCard(option, medicineCheck.symptomMatch === option, () =>
                      setMedicineCheck((prev) => ({
                        ...prev,
                        symptomMatch: option,
                        symptomDetail: option === 'Other' ? prev.symptomDetail : '',
                      }))
                    )
                  )}

                  {medicineCheck.symptomMatch === 'Other' ? (
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={medicineCheck.symptomDetail}
                      onChangeText={(value) => setMedicineCheck((prev) => ({ ...prev, symptomDetail: value }))}
                      placeholder="Describe the reaction"
                      multiline
                    />
                  ) : null}

                  <Text style={styles.fieldLabel}>How serious was the reaction?</Text>
                  <View style={styles.choiceRow}>
                    {medicineSeverityOptions.map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.choiceChip, medicineCheck.severity === item.key && styles.choiceChipActive]}
                        onPress={() => setMedicineCheck((prev) => ({ ...prev, severity: item.key }))}
                      >
                        <Text style={[styles.choiceChipText, medicineCheck.severity === item.key && styles.choiceChipTextActive]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              {medicineCheck.hadReactionBefore === 'unknown' ? (
                <>
                  <View style={styles.questionCard}>
                    <Text style={styles.questionSmall}>QUESTION 3 OF 4</Text>
                    <Text style={styles.questionTitle}>Do you remember any symptoms or concerns?</Text>
                  </View>

                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={medicineCheck.symptomMatch}
                    onChangeText={(value) => setMedicineCheck((prev) => ({ ...prev, symptomMatch: value }))}
                    placeholder="Optional symptoms or concerns"
                    multiline
                  />
                </>
              ) : null}
            </>
          ) : null}

          <View style={styles.questionCard}>
            <Text style={styles.questionSmall}>QUESTION 4 OF 4</Text>
            <Text style={styles.questionTitle}>Are you currently taking any other medicines, including those saved in your profile?</Text>
          </View>

          {[
            { label: 'Yes', key: true },
            { label: 'No', key: false },
            { label: 'I am not sure', key: 'unknown' },
          ].map((item) =>
            renderOptionCard(item.label, medicineCheck.takingOtherMedicinesNow === item.key, () =>
              setMedicineCheck((prev) => ({ ...prev, takingOtherMedicinesNow: item.key }))
            )
          )}

          {medicineCheck.takingOtherMedicinesNow === true ? (
            <View style={styles.utilityCard}>
              <Text style={styles.profileInfoLabel}>Medicines in your profile</Text>
              <Text style={styles.profileInfoValue}>
                {profile.currentMedicationsText || 'No medicines saved yet.'}
              </Text>
              <TouchableOpacity
                style={styles.secondaryButtonFull}
                onPress={() => setRoute('profile-edit')}
              >
                <Text style={styles.secondaryButtonFullText}>Update medicines</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TextInput
            style={[styles.input, styles.textArea]}
            value={medicineCheck.notes}
            onChangeText={(value) => setMedicineCheck((prev) => ({ ...prev, notes: value }))}
            placeholder="Extra notes"
            multiline
          />

          <TouchableOpacity style={styles.primaryButton} onPress={checkMedicine}>
            <Text style={styles.primaryButtonText}>Check Safety</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'result') {
    return (
      <View style={styles.screen}>
        {renderHeader('Safety Result')}
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {latestResult?.card
            ? renderResultCard(
                latestResult.card,
                latestResult.analysis
              )
            : null}
          <TouchableOpacity style={styles.primaryButton} onPress={() => setRoute('history')}>
            <Text style={styles.primaryButtonText}>View Safety History</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButtonFull} onPress={() => setRoute('check-input')}>
            <Text style={styles.secondaryButtonFullText}>Check Another Medicine</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.textButton}
            onPress={() => setRoute('home')}
          >
            <Text style={styles.textButtonText}>
              Back to Home
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'history') {
    return (
      <View style={styles.screen}>
        {renderHeader('Safety History')}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLead}>Your recent medicine checks</Text>

          <View style={styles.historyTabs}>
            <View style={[styles.historyTab, styles.historyTabActive]}>
              <Text style={styles.historyTabTextActive}>Recent Checks</Text>
            </View>
            <View style={styles.historyTab}>
              <Text style={styles.historyTabText}>All History</Text>
            </View>
          </View>

          {!historyItems.length ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No checks yet. Once you check a medicine, it will appear here.
              </Text>
            </View>
          ) : null}

          {historyItems.map((item) => {
            const riskStyle =
              String(item.riskLevel) === 'Dangerous'
                ? styles.dangerBadge
                : String(item.riskLevel) === 'Safe'
                  ? styles.safeBadge
                  : styles.warningBadge;
            const riskTextStyle =
              String(item.riskLevel) === 'Dangerous'
                ? styles.dangerBadgeText
                : String(item.riskLevel) === 'Safe'
                  ? styles.safeBadgeText
                  : styles.warningBadgeText;

            return (
              <TouchableOpacity
                key={`${item.id}-${item.createdAt}`}
                style={styles.historyCard}
                onPress={() => {
                  setSelectedCard(
                    item.card || {
                      title: `${item.medicineName || 'Medicine'} Safety Check`,
                      medicineName: item.medicineName,
                      riskLevel: item.riskLevel,
                      riskScore: item.riskScore,
                      explanation: item.card?.explanation || 'No detailed explanation saved.',
                      recommendation: item.card?.recommendation || 'No recommendation saved.',
                    }
                  );
                  setRoute('history-detail');
                }}
              >
                <View style={styles.historyLeft}>
                  <Text style={styles.historyTitle}>{item.medicineName || 'Medicine'}</Text>
                  <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <View style={[styles.historyBadge, riskStyle]}>
                  <Text style={[styles.historyBadgeText, riskTextStyle]}>
                    {item.riskLevel
                      ? displayRiskLevel(item.riskLevel)
                      : 'Saved'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {renderHeader('Safety History')}
      <ScrollView contentContainerStyle={styles.content}>
        {selectedCard ? renderResultCard(selectedCard) : null}
      </ScrollView>
    </View>
  );
}

const COLORS = {
  bg: '#F4F8F4',
  surface: '#FFFFFF',
  surfaceSoft: '#EEF5F0',
  headerBg: '#0B4F43',
  green: '#11836B',
  greenDark: '#0B4F43',
  greenSoft: '#DDF5EC',
  mint: '#C9EBDD',
  blueSoft: '#E4F0FF',
  amber: '#C67B13',
  amberDark: '#8A530D',
  amberSoft: '#FFF0D8',
  danger: '#C63F46',
  dangerDark: '#8D2430',
  dangerSoft: '#FDE9EB',
  textDark: '#13211D',
  textMuted: '#5F726B',
  cardBorder: '#D4E3DB',
  divider: '#E4ECE7',
  white: '#FFFFFF',
  tealGlow: '#7FD1BC',
  sky: '#5EA8FF',
  shadow: 'rgba(10, 37, 31, 0.10)',
};

const FONTS = Platform.select({
  ios: {
    display: 'Georgia',
    body: 'Avenir Next',
    bodyBold: 'Avenir Next',
  },
  android: {
    display: 'serif',
    body: 'sans-serif',
    bodyBold: 'sans-serif-medium',
  },
  default: {
    display: 'serif',
    body: 'sans-serif',
    bodyBold: 'sans-serif',
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  topBar: {
    backgroundColor: COLORS.headerBg,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    shadowColor: '#00110c',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  backIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  backIconText: {
    color: '#FFFFFF',
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '400',
  },
  topBarTextWrap: { flex: 1 },
  topBarTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
    fontFamily: FONTS.display,
  },
  topBarSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '600',
    fontFamily: FONTS.body,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 56,
  },
  centerArea: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  loadingTitle: { marginTop: 18, fontSize: 19, fontWeight: '800', color: COLORS.textDark, fontFamily: FONTS.display },
  loadingText: { marginTop: 8, fontSize: 15, color: COLORS.textMuted, textAlign: 'center', fontFamily: FONTS.body, lineHeight: 22 },

  heroCard: {
    backgroundColor: '#D9F4EA',
    borderRadius: 28,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#B6E2D1',
    shadowColor: COLORS.greenDark,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroIntroCard: { flex: 1, paddingRight: 16 },
  helloBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  helloBadgeText: { color: COLORS.greenDark, fontSize: 13, fontWeight: '800', fontFamily: FONTS.bodyBold, letterSpacing: 0.4 },
  profileCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  profileCircleText: { color: '#ffffff', fontSize: 24, fontWeight: '800', fontFamily: FONTS.bodyBold },
  heroTextWrap: { flex: 1 },
  heroTitle: { fontSize: 27, fontWeight: '800', color: COLORS.textDark, fontFamily: FONTS.display },
  heroSubtitle: { marginTop: 7, fontSize: 15, color: '#44675B', lineHeight: 22, fontFamily: FONTS.body },

  actionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
    minHeight: 90,
    shadowColor: COLORS.shadow,
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  actionPrimary: { backgroundColor: '#E4F8EF', borderColor: '#B8E5CE' },
  actionIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  actionGreen: { backgroundColor: '#CFF3E0' },
  actionBlue: { backgroundColor: '#DCEBFF' },
  actionOrange: { backgroundColor: '#FFE7C8' },
  actionIcon: { fontSize: 18, fontWeight: '800', color: COLORS.textDark, fontFamily: FONTS.bodyBold },
  actionTextWrap: { flex: 1 },
  actionTitle: { fontSize: 19, fontWeight: '800', color: COLORS.textDark, fontFamily: FONTS.display },
  actionPrimaryText: { color: COLORS.green },
  actionSubtitle: { marginTop: 4, fontSize: 14, color: COLORS.textMuted, fontFamily: FONTS.body, lineHeight: 20 },
  actionPrimarySub: { color: '#3f6b52' },
  actionChevron: { fontSize: 24, color: '#a9b6ab', fontWeight: '700', marginLeft: 6 },

  profileHeader: { alignItems: 'center', paddingBottom: 12 },
  bigProfileCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#DFF4EB',
  },
  bigProfileCircleText: { color: '#ffffff', fontSize: 27, fontWeight: '800', fontFamily: FONTS.bodyBold },
  profileName: { marginTop: 14, fontSize: 24, fontWeight: '800', color: COLORS.textDark, fontFamily: FONTS.display },
  profileMeta: { marginTop: 5, fontSize: 16, color: COLORS.textMuted, fontWeight: '600', fontFamily: FONTS.body },
  profileInfoRow: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 14,
    shadowColor: COLORS.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  profileInfoLabel: { fontSize: 13, fontWeight: '800', color: COLORS.green, marginBottom: 6, fontFamily: FONTS.bodyBold, letterSpacing: 0.3 },
  profileInfoValue: { fontSize: 17, fontWeight: '700', color: COLORS.textDark, lineHeight: 23, fontFamily: FONTS.body },

  sectionLead: { fontSize: 16, color: COLORS.textMuted, marginBottom: 16, lineHeight: 22, fontFamily: FONTS.body },
  fieldLabel: { fontSize: 15, fontWeight: '800', color: COLORS.textDark, marginBottom: 8, marginTop: 6, fontFamily: FONTS.bodyBold },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C8DAD0',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 17,
    color: COLORS.textDark,
    marginBottom: 14,
    fontFamily: FONTS.body,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  choiceChip: {
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#C7D8CF',
    backgroundColor: COLORS.white,
    marginRight: 10,
    marginBottom: 10,
  },
  choiceChipActive: { backgroundColor: COLORS.green, borderColor: COLORS.green, shadowColor: COLORS.greenDark, shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  choiceChipText: { fontSize: 16, fontWeight: '700', color: '#31503d', fontFamily: FONTS.bodyBold },
  choiceChipTextActive: { color: '#ffffff' },

  primaryButton: {
    backgroundColor: COLORS.green,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    marginTop: 10,
    shadowColor: COLORS.greenDark,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  primaryButtonDisabled: { backgroundColor: '#9db8a8' },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    fontFamily: FONTS.bodyBold,
    letterSpacing: 0.2,
  },

  stepDots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#cfd8cf', marginHorizontal: 5 },
  stepDotActive: { width: 26, backgroundColor: COLORS.green },
  stepperWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  stepperItem: { alignItems: 'center' },
  stepperCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E7ECE9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepperCircleActive: { backgroundColor: COLORS.green },
  stepperCircleText: { fontSize: 12, fontWeight: '800', color: '#5c6b63', fontFamily: FONTS.bodyBold },
  stepperCircleTextActive: { color: '#ffffff' },
  stepperLabel: { fontSize: 12, color: '#7a877f', fontWeight: '600', fontFamily: FONTS.body },
  stepperLabelActive: { color: COLORS.textDark, fontWeight: '800' },
  stepperLine: { width: 44, height: 3, backgroundColor: '#D9E2DD', marginHorizontal: 8, marginBottom: 20, borderRadius: 999 },

  questionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
    marginBottom: 14,
    shadowColor: COLORS.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  questionSmall: { fontSize: 13, color: COLORS.green, fontWeight: '800', marginBottom: 10, fontFamily: FONTS.bodyBold, letterSpacing: 0.4 },
  questionTitle: { fontSize: 20, lineHeight: 28, fontWeight: '800', color: COLORS.textDark, fontFamily: FONTS.display },

  optionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.65,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  optionCardActive: { backgroundColor: COLORS.greenSoft, borderColor: COLORS.green, borderWidth: 1.5 },
  optionRadio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#c3cfc5',
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRadioActive: { borderColor: COLORS.green, backgroundColor: COLORS.green },
  optionRadioCheck: { color: '#ffffff', fontSize: 10, fontWeight: '900', fontFamily: FONTS.bodyBold },
  optionText: { fontSize: 17, fontWeight: '700', color: '#31443a', flex: 1, fontFamily: FONTS.bodyBold },
  optionTextActive: { color: COLORS.green },

  formLabel: { fontSize: 21, fontWeight: '800', color: COLORS.textDark, fontFamily: FONTS.display },
  formHint: { fontSize: 15, color: COLORS.textMuted, marginTop: 5, marginBottom: 14, fontFamily: FONTS.body },
  orText: { alignSelf: 'center', fontSize: 13, color: '#758479', marginVertical: 12, fontWeight: '700', fontFamily: FONTS.bodyBold, letterSpacing: 0.8 },
  utilityCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 18,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  suggestionsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginTop: -4,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  suggestionRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  suggestionRowLast: {
    borderBottomWidth: 0,
  },
  suggestionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    fontFamily: FONTS.bodyBold,
  },
  suggestionMeta: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
  },
  utilityGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  utilityCardGrid: {
    flex: 1,
    backgroundColor: '#FCFFFD',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D8E7DB',
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 132,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  utilityIconBig: { fontSize: 28, marginBottom: 12 },
  utilityTitle: { fontSize: 17, fontWeight: '800', color: COLORS.textDark, fontFamily: FONTS.display },
  utilitySub: { marginTop: 4, fontSize: 14, color: COLORS.textMuted, fontFamily: FONTS.body },
  utilityTitleCentered: { fontSize: 16, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', fontFamily: FONTS.display },
  utilitySubCentered: { marginTop: 4, fontSize: 13, color: COLORS.textMuted, textAlign: 'center', fontFamily: FONTS.body, lineHeight: 18 },
  voiceInfoText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: -4,
    marginBottom: 10,
    lineHeight: 18,
    fontFamily: FONTS.body,
  },
  voiceErrorText: {
    fontSize: 13,
    color: COLORS.dangerDark,
    marginTop: -2,
    marginBottom: 10,
    lineHeight: 18,
    fontWeight: '600',
    fontFamily: FONTS.body,
  },
  secondaryButtonFull: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 58,
    marginTop: 12,
  },
  secondaryButtonFullText: {
    color: COLORS.textDark,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: FONTS.bodyBold,
  },

  confirmTopCard: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  confirmTopText: { fontSize: 16, color: '#3c4f44', textAlign: 'center', fontWeight: '700', lineHeight: 22, fontFamily: FONTS.body },
  confirmLabel: { fontSize: 17, fontWeight: '800', color: COLORS.textDark, marginBottom: 12, fontFamily: FONTS.display },
  confirmTable: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1ed',
  },
  confirmRowLast: { borderBottomWidth: 0 },
  confirmKey: { fontSize: 14, color: '#52615a', fontWeight: '700', fontFamily: FONTS.bodyBold },
  confirmValue: { fontSize: 17, color: '#23342a', fontWeight: '800', fontFamily: FONTS.display },
  noticeBox: { backgroundColor: '#E7F7EE', borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#CBE6D6' },
  noticeText: { color: '#2A4F3A', fontSize: 15, lineHeight: 21, fontWeight: '600', fontFamily: FONTS.body },
  inlineReadButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F0FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  inlineReadButtonText: {
    color: '#315A8A',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: FONTS.bodyBold,
  },
  bottomActions: { flexDirection: 'row', marginTop: 8 },
  outlineHalf: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C9D5C9',
    paddingVertical: 17,
    alignItems: 'center',
    marginRight: 8,
  },
  outlineHalfText: { color: '#31473a', fontSize: 16, fontWeight: '700', fontFamily: FONTS.bodyBold },
  fillHalf: {
    flex: 1,
    backgroundColor: COLORS.green,
    borderRadius: 18,
    paddingVertical: 17,
    alignItems: 'center',
    marginLeft: 8,
  },
  fillHalfText: { color: '#ffffff', fontSize: 16, fontWeight: '800', fontFamily: FONTS.bodyBold },

  readAloudButton: {
    backgroundColor: '#0E6F5C',
    borderRadius: 18,
    paddingVertical: 18,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.greenDark,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  readAloudText: { color: '#ffffff', fontSize: 16, fontWeight: '800', fontFamily: FONTS.display },
  loadingCard: {
    width: '100%',
    maxWidth: 320,
    marginTop: 24,
    backgroundColor: COLORS.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 18,
    shadowColor: COLORS.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  loadingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#d9dfdc',
    marginRight: 12,
  },
  loadingDotDone: { backgroundColor: COLORS.green },
  loadingRowText: { fontSize: 15, color: COLORS.textDark, fontWeight: '600', fontFamily: FONTS.body },

  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 16, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20, fontFamily: FONTS.body },
  historyTabs: {
    flexDirection: 'row',
    backgroundColor: '#EAF0EC',
    borderRadius: 18,
    padding: 4,
    marginBottom: 16,
  },
  historyTab: { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  historyTabActive: { backgroundColor: '#ffffff' },
  historyTabText: { color: '#7b877f', fontSize: 13, fontWeight: '700', fontFamily: FONTS.bodyBold },
  historyTabTextActive: { color: COLORS.textDark, fontSize: 13, fontWeight: '800', fontFamily: FONTS.bodyBold },
  historyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 18,
    marginBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  historyLeft: { flex: 1, paddingRight: 12 },
  historyTitle: { fontSize: 19, fontWeight: '800', color: '#23342a', fontFamily: FONTS.display },
  historyDate: { marginTop: 5, fontSize: 14, color: COLORS.textMuted, fontFamily: FONTS.body },
  historyBadge: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  historyBadgeText: { fontSize: 13, fontWeight: '800', fontFamily: FONTS.bodyBold },
  warningBadge: { backgroundColor: '#fff1d5' },
  safeBadge: { backgroundColor: '#e7f7ec' },
  dangerBadge: { backgroundColor: '#fce7e5' },
  warningBadgeText: { color: '#7a4c00' },
  safeBadgeText: { color: COLORS.green },
  dangerBadgeText: { color: '#8a221d' },
  medicineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  medicineHeaderTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: COLORS.green,
    fontWeight: '800',
    marginBottom: 5,
    fontFamily: FONTS.bodyBold,
  },
  medicineHeading: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: COLORS.textDark,
    fontFamily: FONTS.display,
  },
  riskChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  riskChipDanger: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: '#F1C7C7',
  },
  riskChipSafe: {
    backgroundColor: COLORS.greenSoft,
    borderColor: '#B9DCCF',
  },
  riskChipCaution: {
    backgroundColor: COLORS.amberSoft,
    borderColor: '#F2D39D',
  },
  riskChipText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
    fontFamily: FONTS.bodyBold,
  },
  riskChipTextDanger: {
    color: COLORS.dangerDark,
  },
  riskChipTextSafe: {
    color: COLORS.greenDark,
  },
  riskChipTextCaution: {
    color: COLORS.amberDark,
  },
  resultCardModern: {
    borderRadius: 28,
    padding: 20,
    flexDirection: 'row',
    marginBottom: 18,
    borderWidth: 1,
    shadowColor: COLORS.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  resultDanger: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: '#F0C3C3',
  },
  resultSafe: {
    backgroundColor: COLORS.greenSoft,
    borderColor: '#B7DCCC',
  },
  resultCaution: {
    backgroundColor: COLORS.amberSoft,
    borderColor: '#F0D19C',
  },
  resultIconModern: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  resultIconDangerModern: {
    backgroundColor: '#F8D4D4',
  },
  resultIconSafeModern: {
    backgroundColor: '#CFE9DF',
  },
  resultIconCautionModern: {
    backgroundColor: '#FBE4B8',
  },
  resultIconModernText: {
    fontSize: 19,
    fontWeight: '900',
    fontFamily: FONTS.bodyBold,
  },
  resultModernBody: {
    flex: 1,
  },
  resultSmallLabel: {
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '900',
    color: COLORS.textMuted,
    marginBottom: 7,
    fontFamily: FONTS.bodyBold,
  },
  resultModernTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    marginBottom: 9,
    fontFamily: FONTS.display,
  },
  resultModernDescription: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    fontFamily: FONTS.body,
  },
  resultDangerText: {
    color: COLORS.dangerDark,
  },
  resultSafeText: {
    color: COLORS.greenDark,
  },
  resultCautionText: {
    color: COLORS.amberDark,
  },
  modernInfoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
    marginBottom: 18,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.95,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sectionIconText: {
    color: COLORS.green,
    fontSize: 17,
    fontWeight: '900',
    fontFamily: FONTS.bodyBold,
  },
  modernSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textDark,
    fontFamily: FONTS.display,
  },
  modernBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modernBulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
    marginTop: 8,
    marginRight: 12,
  },
  modernBulletText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 25,
    color: COLORS.textDark,
    fontWeight: '600',
    fontFamily: FONTS.body,
  },
  actionAdviceCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginBottom: 18,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  actionAdviceDanger: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: '#EABBBB',
  },
  actionAdviceSafe: {
    backgroundColor: COLORS.greenSoft,
    borderColor: '#B6D7C9',
  },
  actionAdviceCaution: {
    backgroundColor: COLORS.amberSoft,
    borderColor: '#EDD09D',
  },
  actionAdviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  actionAdviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionAdviceIconDanger: {
    backgroundColor: '#F7CECE',
  },
  actionAdviceIconSafe: {
    backgroundColor: '#CCE7DC',
  },
  actionAdviceIconCaution: {
    backgroundColor: '#F8E0AE',
  },
  actionAdviceIconText: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: FONTS.bodyBold,
  },
  actionAdviceLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
    fontFamily: FONTS.display,
  },
  actionAdviceMain: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '900',
    marginBottom: 10,
    fontFamily: FONTS.display,
  },
  actionAdviceSupport: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
    fontFamily: FONTS.body,
  },
  simpleSummaryCard: {
    backgroundColor: '#EEF6F1',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#D8E8DE',
  },
  simpleSummaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.green,
    marginBottom: 7,
    fontFamily: FONTS.bodyBold,
  },
  simpleSummaryText: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textDark,
    fontWeight: '600',
    fontFamily: FONTS.body,
  },
  technicalToggleModern: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 18,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.75,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  technicalToggleModernTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textDark,
    fontFamily: FONTS.display,
  },
  technicalToggleModernSub: {
    fontSize: 13,
    marginTop: 4,
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
  },
  technicalChevron: {
    fontSize: 22,
    color: COLORS.green,
    fontWeight: '700',
  },
  technicalCardModern: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 20,
    marginBottom: 18,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.95,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  technicalHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 18,
    fontFamily: FONTS.display,
  },
  technicalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  technicalRowColumn: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  technicalLabel: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '700',
    fontFamily: FONTS.bodyBold,
  },
  technicalValue: {
    fontSize: 17,
    color: COLORS.textDark,
    fontWeight: '800',
    fontFamily: FONTS.display,
  },
  technicalValueLarge: {
    marginTop: 6,
    fontSize: 22,
    color: COLORS.textDark,
    fontWeight: '900',
    fontFamily: FONTS.display,
  },
  technicalValueText: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 23,
    color: COLORS.textDark,
    fontWeight: '700',
    fontFamily: FONTS.body,
  },
  populationLabel: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: COLORS.blueSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    color: '#355C8A',
    fontWeight: '800',
    fontFamily: FONTS.bodyBold,
  },
  mlDisclaimerBox: {
    marginTop: 18,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    padding: 16,
  },
  mlDisclaimerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.green,
    marginBottom: 7,
    fontFamily: FONTS.bodyBold,
  },
  mlDisclaimerText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
  },
  technicalExplanation: {
    marginTop: 16,
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
  },
  sideEffectsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.95,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
  },
  sideEffectsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  sideEffectsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sideEffectsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sideEffectsIconText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#355C8A',
    fontFamily: FONTS.bodyBold,
  },
  sideEffectsTitleWrap: {
    flex: 1,
  },
  sideEffectsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textDark,
    fontFamily: FONTS.display,
  },
  sideEffectsSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textMuted,
    marginTop: 3,
    fontFamily: FONTS.body,
  },
  sideEffectsChevron: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.green,
    marginLeft: 10,
  },
  sideEffectsContent: {
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  sideEffectsNotice: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    padding: 14,
    marginBottom: 15,
  },
  sideEffectsNoticeText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    fontWeight: '600',
    fontFamily: FONTS.body,
  },
  sideEffectsSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textDark,
    marginBottom: 10,
    marginTop: 4,
    fontFamily: FONTS.bodyBold,
  },
  sideEffectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 11,
  },
  sideEffectBullet: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#6B83A6',
    marginTop: 8,
    marginRight: 12,
  },
  sideEffectBulletSevere: {
    backgroundColor: COLORS.danger,
  },
  sideEffectText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
    color: COLORS.textDark,
    fontWeight: '600',
    fontFamily: FONTS.body,
  },
  sideEffectsEmpty: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textMuted,
    fontFamily: FONTS.body,
  },
  textButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 5,
    marginBottom: 18,
  },
  textButtonText: {
    color: COLORS.green,
    fontSize: 16,
    fontWeight: '800',
    fontFamily: FONTS.bodyBold,
  },
});
