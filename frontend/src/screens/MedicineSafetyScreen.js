
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { allergyService } from '../services/allergyService';

const QUESTIONS = [
  { key: 'pastReaction', label: 'Have you ever had an allergic reaction to medicine?', options: ['Yes', 'No', 'Not sure'] },
  { key: 'reactionSymptoms', label: 'What happened?', options: ['Skin rash', 'Swelling', 'Breathing trouble', 'Vomiting', 'Dizziness', 'Other'], detailKey: 'reactionSymptomsDetail' },
  { key: 'medicineName', label: 'Do you remember the medicine name?', options: ['Yes', 'No'], detailKey: 'medicineNameDetail' },
  { key: 'doctorAdvice', label: 'Did a doctor ask you to avoid any medicine?', options: ['Yes', 'No'], detailKey: 'doctorAdviceDetail' },
  { key: 'painkillerAntibioticReaction', label: 'Have you reacted to antibiotics or painkillers before?', options: ['Yes', 'No', 'Not sure'] },
];

const emptyProfile = { age: '', gender: '', hasMedicineAllergy: null, knownAllergiesText: '', chronicDiseasesText: '', currentMedicationsText: '', emergencyContact: '', caregiverDetails: '' };
const emptyInput = { inputMethod: 'manual', medicineName: '', normalizedDrugName: '', dose: '', frequency: '' };
const emptyCheck = { takenBefore: null, hadReactionBefore: null, symptomMatch: '', severity: 'mild', notes: '', takingOtherMedicinesNow: null };

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

const profileComplete = (profile) => Boolean(profile.age?.trim()) && Boolean(profile.gender?.trim()) && profile.hasMedicineAllergy !== null && Boolean(profile.emergencyContact?.trim());
const errorText = (error, fallback) => error.response?.data?.error || error.message || fallback;
const formatDate = (value) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
};

const cleanExplanation = (text) => {
  if (!text) return 'No explanation available.';
  return String(text)
    .replace(/The baseline ML model also estimated [^.]+ reaction risk\./gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export default function MedicineSafetyScreen({ onBack, onLogout, initialRoute = 'home' }) {
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

  useEffect(() => { setRoute(initialRoute); }, [initialRoute]);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, q, c, h] = await Promise.all([
          allergyService.getProfile(),
          allergyService.getQuestionnaire(),
          allergyService.getCards(),
          allergyService.getHistory(),
        ]);
        setProfile({ ...emptyProfile, ...p });
        setAnswers(normalizeAnswers(q));
        setCards(c);
        setHistory(h);
      } catch (error) {
        Alert.alert('Load failed', errorText(error, 'Could not load medicine safety.'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const historyItems = useMemo(() => history.map((item) => ({ ...item, card: cards.find((card) => String(card.medicineName || '').toLowerCase() === String(item.medicineName || '').toLowerCase()) })), [history, cards]);
  const currentQuestion = QUESTIONS[questionIndex];

  const openMedicineFlow = () => {
    if (!profileComplete(profile)) {
      setRoute('profile-edit');
      return;
    }
    const hasAnswers = QUESTIONS.some((q) => Boolean(answers[q.key]));
    setRoute(hasAnswers ? 'check-input' : 'questions');
  };

  const saveProfile = async () => {
    if (!profileComplete(profile)) {
      Alert.alert('Missing details', 'Please fill age, gender, medicine allergy, and emergency contact.');
      return;
    }
    try {
      setSaving(true);
      const saved = await allergyService.saveProfile(profile);
      setProfile({ ...emptyProfile, ...saved });
      setRoute('questions');
    } catch (error) {
      Alert.alert('Save failed', errorText(error, 'Could not save health profile.'));
    } finally {
      setSaving(false);
    }
  };

  const saveQuestionnaire = async () => {
    const payload = QUESTIONS.map((q) => ({ questionKey: q.key, answerText: answers[q.detailKey] ? `${answers[q.key]}: ${answers[q.detailKey]}` : answers[q.key] || '' }));
    if (payload.some((item) => !item.answerText)) {
      Alert.alert('Incomplete', 'Please answer all allergy questions.');
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
    if (!medicineInput.medicineName.trim()) {
      Alert.alert('Missing medicine', 'Please type the medicine name first.');
      return;
    }
    try {
      setRoute('loading');
      const result = await allergyService.analyzeMedicine({
        ...medicineInput,
        ...medicineCheck,
        normalizedDrugName: medicineInput.normalizedDrugName || medicineInput.medicineName.toLowerCase(),
      });
      setLatestResult(result);
      setCards((prev) => [result.card, ...prev.filter((item) => item.id !== result.card.id)]);
      setHistory(await allergyService.getHistory());
      setSelectedCard(result.card);
      setMedicineInput(emptyInput);
      setMedicineCheck(emptyCheck);
      setRoute('result');
    } catch (error) {
      Alert.alert('Check failed', errorText(error, 'Could not check medicine safety.'));
      setRoute('check-questions');
    }
  };

  const renderHeader = (title) => (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.backIcon} onPress={route === 'home' ? onBack : () => setRoute('home')}>
        <Text style={styles.backIconText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.topBarTitle}>{title}</Text>
    </View>
  );

  const renderResultCard = (card) => {
    const risk = String(card.riskLevel || 'Warning');
    const warningStyle = risk === 'Dangerous' ? styles.dangerPill : risk === 'Safe' ? styles.safePill : styles.warningPill;
    const warningTextStyle = risk === 'Dangerous' ? styles.dangerPillText : risk === 'Safe' ? styles.safePillText : styles.warningPillText;
    return (
      <>
        <Text style={styles.medicineHeading}>{card.medicineName || 'Medicine'}</Text>
        <View style={styles.resultBanner}>
          <Text style={styles.resultBannerIcon}>{risk === 'Safe' ? '✓' : risk === 'Dangerous' ? '⛔' : '⚠️'}</Text>
          <View>
            <Text style={styles.resultBannerTitle}>{risk}</Text>
            <Text style={styles.resultBannerSub}>{risk === 'Safe' ? 'Looks safe' : risk === 'Dangerous' ? 'Do not take now' : 'Use with caution'}</Text>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Safety score</Text>
          <View style={styles.scoreBarTrack}><View style={[styles.scoreBarFill, { width: `${Math.max(8, Number(card.riskScore || 0))}%` }]} /></View>
          <Text style={styles.scoreValue}>{card.riskScore ?? '--'}/100</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Why this result?</Text>
          <Text style={styles.infoText}>{cleanExplanation(card.explanation)}</Text>
        </View>

        <View style={[styles.recommendationCard, warningStyle]}>
          <Text style={[styles.recommendationTitle, warningTextStyle]}>Recommendation</Text>
          <Text style={[styles.recommendationText, warningTextStyle]}>{card.recommendation || 'No recommendation available.'}</Text>
        </View>
      </>
    );
  };

  const renderResultCardWithAnalysis = (card, analysis = null) => {
    if (!analysis) {
      return renderResultCard(card);
    }

    const medicationKnowledge = analysis.medicationKnowledge || null;
    const mlPrediction = analysis.mlPrediction || medicationKnowledge?.mlPrediction || null;

    return (
      <>
        {renderResultCard(card)}
        {mlPrediction?.available ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>ML Support Score</Text>
            <Text style={styles.infoText}>{`${mlPrediction.mlRiskScore ?? '--'}/100`}</Text>
            <Text style={styles.supportText}>Used as a support signal together with the allergy and interaction rules.</Text>
          </View>
        ) : null}
        {medicationKnowledge ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Medicine Knowledge</Text>
            <Text style={styles.infoText}>
              {[
                medicationKnowledge.therapeuticClass ? `Class: ${medicationKnowledge.therapeuticClass}` : null,
                Number.isFinite(Number(analysis?.interactionCount ?? card.interactionCount)) ? `Interactions: ${analysis?.interactionCount ?? card.interactionCount}` : null,
                Number.isFinite(Number(analysis?.sideEffectCount ?? card.sideEffectCount)) ? `Side effects: ${analysis?.sideEffectCount ?? card.sideEffectCount}` : null,
              ].filter(Boolean).join('\n')}
            </Text>
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
          <ActivityIndicator size="large" color="#1f6a45" />
          <Text style={styles.loadingTitle}>Checking medicine safety...</Text>
          <Text style={styles.loadingText}>Looking for allergy risk and interactions.</Text>
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
            <View style={styles.profileCircle}><Text style={styles.profileCircleText}>RJ</Text></View>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>Good morning</Text>
              <Text style={styles.heroSubtitle}>Choose one action below</Text>
            </View>
          </View>

          <TouchableOpacity style={[styles.actionCard, styles.actionPrimary]} onPress={openMedicineFlow}>
            <View style={[styles.actionIconWrap, styles.actionGreen]}><Text style={styles.actionIcon}>💊</Text></View>
            <View>
              <Text style={[styles.actionTitle, styles.actionPrimaryText]}>Check a Medicine</Text>
              <Text style={[styles.actionSubtitle, styles.actionPrimarySub]}>Is it safe for you?</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => setRoute('profile-view')}>
            <View style={[styles.actionIconWrap, styles.actionBlue]}><Text style={styles.actionIcon}>👤</Text></View>
            <View>
              <Text style={styles.actionTitle}>My Profile</Text>
              <Text style={styles.actionSubtitle}>Health info & allergies</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => setRoute('history')}>
            <View style={[styles.actionIconWrap, styles.actionOrange]}><Text style={styles.actionIcon}>📋</Text></View>
            <View>
              <Text style={styles.actionTitle}>Safety History</Text>
              <Text style={styles.actionSubtitle}>Your past checks</Text>
            </View>
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
            <View style={styles.bigProfileCircle}><Text style={styles.bigProfileCircleText}>RJ</Text></View>
            <Text style={styles.profileName}>Health Profile</Text>
            <Text style={styles.profileMeta}>Age {profile.age || '--'} • {profile.gender || '--'}</Text>
          </View>

          {[
            ['Known Allergies', profile.knownAllergiesText || 'Not added yet'],
            ['Chronic Conditions', profile.chronicDiseasesText || 'Not added yet'],
            ['Current Medicines', profile.currentMedicationsText || 'Not added yet'],
            ['Emergency Contact', profile.emergencyContact || 'Not added yet'],
            ['Caregiver', profile.caregiverDetails || 'Not added yet'],
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
          <Text style={styles.sectionLead}>Collect only the key details needed before medicine checks.</Text>
          <TextInput style={styles.input} value={profile.age} onChangeText={(v) => setProfile((p) => ({ ...p, age: v }))} placeholder="Age" keyboardType="numeric" />
          <View style={styles.choiceRow}>{['Male', 'Female', 'Other'].map((g) => <TouchableOpacity key={g} style={[styles.choiceChip, profile.gender === g && styles.choiceChipActive]} onPress={() => setProfile((p) => ({ ...p, gender: g }))}><Text style={[styles.choiceChipText, profile.gender === g && styles.choiceChipTextActive]}>{g}</Text></TouchableOpacity>)}</View>
          <View style={styles.choiceRow}>{[{ label: 'Allergy Yes', value: true }, { label: 'Allergy No', value: false }].map((o) => <TouchableOpacity key={o.label} style={[styles.choiceChip, profile.hasMedicineAllergy === o.value && styles.choiceChipActive]} onPress={() => setProfile((p) => ({ ...p, hasMedicineAllergy: o.value }))}><Text style={[styles.choiceChipText, profile.hasMedicineAllergy === o.value && styles.choiceChipTextActive]}>{o.label}</Text></TouchableOpacity>)}</View>
          <TextInput style={[styles.input, styles.textArea]} value={profile.knownAllergiesText} onChangeText={(v) => setProfile((p) => ({ ...p, knownAllergiesText: v }))} placeholder="Known allergies" multiline />
          <TextInput style={[styles.input, styles.textArea]} value={profile.chronicDiseasesText} onChangeText={(v) => setProfile((p) => ({ ...p, chronicDiseasesText: v }))} placeholder="Chronic diseases" multiline />
          <TextInput style={[styles.input, styles.textArea]} value={profile.currentMedicationsText} onChangeText={(v) => setProfile((p) => ({ ...p, currentMedicationsText: v }))} placeholder="Current medicines" multiline />
          <TextInput style={styles.input} value={profile.emergencyContact} onChangeText={(v) => setProfile((p) => ({ ...p, emergencyContact: v }))} placeholder="Emergency contact" />
          <TextInput style={styles.input} value={profile.caregiverDetails} onChangeText={(v) => setProfile((p) => ({ ...p, caregiverDetails: v }))} placeholder="Caregiver details" />
          <TouchableOpacity style={styles.primaryButton} onPress={saveProfile} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save Health Profile'}</Text></TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'questions') {
    const showDetail = (currentQuestion.key === 'reactionSymptoms' && answers.reactionSymptoms === 'Other') || (currentQuestion.key === 'medicineName' && answers.medicineName === 'Yes') || (currentQuestion.key === 'doctorAdvice' && answers.doctorAdvice === 'Yes');
    return (
      <View style={styles.screen}>
        {renderHeader('A Few Questions')}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.stepDots}>{QUESTIONS.map((_, index) => <View key={index} style={[styles.stepDot, index === questionIndex && styles.stepDotActive]} />)}</View>
          <View style={styles.questionCard}>
            <Text style={styles.questionSmall}>Question {questionIndex + 1} of {QUESTIONS.length}</Text>
            <Text style={styles.questionTitle}>{currentQuestion.label}</Text>
          </View>
          {currentQuestion.options.map((option) => <TouchableOpacity key={option} style={[styles.optionCard, answers[currentQuestion.key] === option && styles.optionCardActive]} onPress={() => setAnswers((prev) => ({ ...prev, [currentQuestion.key]: option }))}><Text style={[styles.optionText, answers[currentQuestion.key] === option && styles.optionTextActive]}>{option}</Text></TouchableOpacity>)}
          {showDetail ? <TextInput style={[styles.input, styles.textArea]} value={answers[currentQuestion.detailKey]} onChangeText={(v) => setAnswers((prev) => ({ ...prev, [currentQuestion.detailKey]: v }))} placeholder="Add details" multiline /> : null}
          <TouchableOpacity style={styles.primaryButton} onPress={questionIndex === QUESTIONS.length - 1 ? saveQuestionnaire : () => setQuestionIndex((i) => i + 1)} disabled={!answers[currentQuestion.key] || saving}><Text style={styles.primaryButtonText}>{questionIndex === QUESTIONS.length - 1 ? (saving ? 'Saving...' : 'Save Allergy Answers') : 'Next →'}</Text></TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'check-input') {
    return (
      <View style={styles.screen}>
        {renderHeader('Check a Medicine')}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.formLabel}>Type the medicine name</Text>
          <Text style={styles.formHint}>Write exactly as shown on the packet</Text>
          <TextInput style={styles.input} value={medicineInput.medicineName} onChangeText={(v) => setMedicineInput((m) => ({ ...m, medicineName: v, normalizedDrugName: m.normalizedDrugName || v.toLowerCase() }))} placeholder="e.g. Amoxicillin 500mg" />
          <Text style={styles.orText}>or</Text>
          <TouchableOpacity style={styles.utilityCard} onPress={() => Alert.alert('Scan Prescription', 'OCR button is included in the flow. OCR logic can be connected next.')}><Text style={styles.utilityTitle}>Scan Prescription</Text><Text style={styles.utilitySub}>Take a photo of your prescription</Text></TouchableOpacity>
          <TouchableOpacity style={styles.utilityCard} onPress={() => Alert.alert('Use Voice', 'Voice input button is included in the flow. Microphone logic can be connected next.')}><Text style={styles.utilityTitle}>Use Voice</Text><Text style={styles.utilitySub}>Speak the medicine name</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButtonFull} onPress={() => setRoute('confirm')}><Text style={styles.secondaryButtonFullText}>Next →</Text></TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'confirm') {
    return (
      <View style={styles.screen}>
        {renderHeader('Confirm Prescription')}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.confirmTopCard}><Text style={styles.confirmTopText}>Prescription scanned — please confirm the details below</Text></View>
          <Text style={styles.confirmLabel}>We found this information:</Text>
          <View style={styles.confirmTable}>
            <View style={styles.confirmRow}><Text style={styles.confirmKey}>Medicine</Text><Text style={styles.confirmValue}>{medicineInput.medicineName || 'Amoxicillin'}</Text></View>
            <View style={styles.confirmRow}><Text style={styles.confirmKey}>Full name</Text><Text style={styles.confirmValue}>{medicineInput.medicineName || 'Amoxicillin 500mg'}</Text></View>
            <View style={styles.confirmRow}><Text style={styles.confirmKey}>Dose</Text><Text style={styles.confirmValue}>{medicineInput.dose || '500 mg'}</Text></View>
            <View style={styles.confirmRow}><Text style={styles.confirmKey}>Frequency</Text><Text style={styles.confirmValue}>{medicineInput.frequency || '3 times a day'}</Text></View>
          </View>
          <View style={styles.noticeBox}><Text style={styles.noticeText}>Please check carefully. If anything looks wrong, tap “Edit” to correct it.</Text></View>
          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.outlineHalf} onPress={() => setRoute('check-input')}><Text style={styles.outlineHalfText}>Edit</Text></TouchableOpacity>
            <TouchableOpacity style={styles.fillHalf} onPress={() => setRoute('check-questions')}><Text style={styles.fillHalfText}>Confirm ✓</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (route === 'check-questions') {
    return (
      <View style={styles.screen}>
        {renderHeader('A Few Questions')}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.stepDots}>{[0, 1, 2, 3].map((index) => <View key={index} style={[styles.stepDot, index === 0 && styles.stepDotActive]} />)}</View>
          <View style={styles.questionCard}><Text style={styles.questionSmall}>Question 1 of 4</Text><Text style={styles.questionTitle}>Have you taken {medicineInput.medicineName || 'this medicine'} before?</Text></View>
          {[{ label: 'Yes, I have taken it before', key: true }, { label: 'No, this is new for me', key: false }, { label: 'I am not sure', key: 'unknown' }].map((item) => <TouchableOpacity key={item.label} style={[styles.optionCard, medicineCheck.takenBefore === item.key && styles.optionCardActive]} onPress={() => setMedicineCheck((prev) => ({ ...prev, takenBefore: item.key === 'unknown' ? null : item.key }))}><Text style={[styles.optionText, medicineCheck.takenBefore === item.key && styles.optionTextActive]}>{item.label}</Text></TouchableOpacity>)}
          <View style={styles.questionCard}><Text style={styles.questionSmall}>Question 2 of 4</Text><Text style={styles.questionTitle}>Have you had a reaction to this medicine before?</Text></View>
          {[{ label: 'Yes', key: true }, { label: 'No', key: false }, { label: 'I am not sure', key: 'unknown' }].map((item) => <TouchableOpacity key={`reaction-${item.label}`} style={[styles.optionCard, medicineCheck.hadReactionBefore === item.key && styles.optionCardActive]} onPress={() => setMedicineCheck((prev) => ({ ...prev, hadReactionBefore: item.key === 'unknown' ? null : item.key }))}><Text style={[styles.optionText, medicineCheck.hadReactionBefore === item.key && styles.optionTextActive]}>{item.label}</Text></TouchableOpacity>)}
          <View style={styles.questionCard}><Text style={styles.questionSmall}>Question 3 of 4</Text><Text style={styles.questionTitle}>Symptoms or concerns</Text></View>
          <TextInput style={[styles.input, styles.textArea]} value={medicineCheck.symptomMatch} onChangeText={(v) => setMedicineCheck((prev) => ({ ...prev, symptomMatch: v }))} placeholder="Symptoms or concerns" multiline />
          <View style={styles.choiceRow}>{['mild', 'moderate', 'severe'].map((level) => <TouchableOpacity key={level} style={[styles.choiceChip, medicineCheck.severity === level && styles.choiceChipActive]} onPress={() => setMedicineCheck((prev) => ({ ...prev, severity: level }))}><Text style={[styles.choiceChipText, medicineCheck.severity === level && styles.choiceChipTextActive]}>{level}</Text></TouchableOpacity>)}</View>
          <View style={styles.questionCard}><Text style={styles.questionSmall}>Question 4 of 4</Text><Text style={styles.questionTitle}>Are you taking other medicines now?</Text></View>
          {[{ label: 'Yes', key: true }, { label: 'No', key: false }].map((item) => <TouchableOpacity key={`meds-${item.label}`} style={[styles.optionCard, medicineCheck.takingOtherMedicinesNow === item.key && styles.optionCardActive]} onPress={() => setMedicineCheck((prev) => ({ ...prev, takingOtherMedicinesNow: item.key }))}><Text style={[styles.optionText, medicineCheck.takingOtherMedicinesNow === item.key && styles.optionTextActive]}>{item.label}</Text></TouchableOpacity>)}
          <TextInput style={[styles.input, styles.textArea]} value={medicineCheck.notes} onChangeText={(v) => setMedicineCheck((prev) => ({ ...prev, notes: v }))} placeholder="Extra notes" multiline />
          <TouchableOpacity style={styles.secondaryButtonFull} onPress={checkMedicine}><Text style={styles.secondaryButtonFullText}>Next →</Text></TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (route === 'result') {
    return (
      <View style={styles.screen}>
        {renderHeader('Safety Result')}
        <ScrollView contentContainerStyle={styles.content}>
          {latestResult?.card ? renderResultCardWithAnalysis(latestResult.card, latestResult.analysis) : null}
          <TouchableOpacity style={styles.primaryButton} onPress={() => setRoute('history')}><Text style={styles.primaryButtonText}>Save Result</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButtonFull} onPress={() => setRoute('home')}><Text style={styles.secondaryButtonFullText}>Back to Home</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButtonFull} onPress={() => setRoute('check-input')}><Text style={styles.secondaryButtonFullText}>Check Another Medicine</Text></TouchableOpacity>
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
          {historyItems.map((item) => {
            const riskStyle = String(item.riskLevel) === 'Dangerous' ? styles.dangerBadge : String(item.riskLevel) === 'Safe' ? styles.safeBadge : styles.warningBadge;
            const riskTextStyle = String(item.riskLevel) === 'Dangerous' ? styles.dangerBadgeText : String(item.riskLevel) === 'Safe' ? styles.safeBadgeText : styles.warningBadgeText;
            return (
              <TouchableOpacity key={`${item.id}-${item.createdAt}`} style={styles.historyCard} onPress={() => { setSelectedCard(item.card || { title: `${item.medicineName || 'Medicine'} Safety Check`, medicineName: item.medicineName, riskLevel: item.riskLevel, riskScore: item.riskScore, explanation: item.card?.explanation || 'No detailed explanation saved.', recommendation: item.card?.recommendation || 'No recommendation saved.' }); setRoute('history-detail'); }}>
                <View style={styles.historyLeft}><Text style={styles.historyTitle}>{item.medicineName || 'Medicine'}</Text><Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text></View>
                <View style={[styles.historyBadge, riskStyle]}><Text style={[styles.historyBadgeText, riskTextStyle]}>{item.riskLevel || 'Saved'}</Text></View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f6f2' },
  topBar: { backgroundColor: '#1f6a45', paddingTop: 18, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  backIconText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  topBarTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 28 },
  centerArea: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingTitle: { marginTop: 14, fontSize: 16, fontWeight: '800', color: '#1f2c24' },
  loadingText: { marginTop: 6, fontSize: 13, color: '#67796d' },
  heroCard: { backgroundColor: '#e9f4ec', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  profileCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1f6a45', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  profileCircleText: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  heroTextWrap: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#203127' },
  heroSubtitle: { marginTop: 4, fontSize: 13, color: '#68786d' },
  actionCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d8e1d7', marginBottom: 12 },
  actionPrimary: { backgroundColor: '#eff8f2', borderColor: '#bdd8c7' },
  actionIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actionGreen: { backgroundColor: '#d7f0df' },
  actionBlue: { backgroundColor: '#dbe9ff' },
  actionOrange: { backgroundColor: '#fde7cf' },
  actionIcon: { fontSize: 22 },
  actionTitle: { fontSize: 18, fontWeight: '800', color: '#223428' },
  actionPrimaryText: { color: '#1f6a45' },
  actionSubtitle: { marginTop: 3, fontSize: 13, color: '#6a7b6f' },
  actionPrimarySub: { color: '#4e7860' },
  profileHeader: { alignItems: 'center', paddingBottom: 10 },
  bigProfileCircle: { width: 74, height: 74, borderRadius: 37, backgroundColor: '#1f6a45', alignItems: 'center', justifyContent: 'center' },
  bigProfileCircleText: { color: '#ffffff', fontSize: 28, fontWeight: '800' },
  profileName: { marginTop: 12, fontSize: 24, fontWeight: '800', color: '#24352b' },
  profileMeta: { marginTop: 4, fontSize: 14, color: '#6a7b6f' },
  profileInfoRow: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#d8e1d7', padding: 14, marginBottom: 10 },
  profileInfoLabel: { fontSize: 12, fontWeight: '700', color: '#738277', marginBottom: 4 },
  profileInfoValue: { fontSize: 15, fontWeight: '700', color: '#24352b' },
  sectionLead: { fontSize: 14, color: '#69796d', marginBottom: 12 },
  input: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#cfd8cf', paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#1f2c24', marginBottom: 10 },
  textArea: { minHeight: 84, textAlignVertical: 'top' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  choiceChip: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#cad4cb', backgroundColor: '#ffffff', marginRight: 8, marginBottom: 8 },
  choiceChipActive: { backgroundColor: '#1f6a45', borderColor: '#1f6a45' },
  choiceChipText: { fontSize: 14, fontWeight: '700', color: '#31503d' },
  choiceChipTextActive: { color: '#ffffff' },
  primaryButton: { backgroundColor: '#1f6a45', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  stepDots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 14 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cfd8cf', marginHorizontal: 4 },
  stepDotActive: { width: 18, backgroundColor: '#1f6a45' },
  questionCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#d8e1d7', padding: 16, marginBottom: 12 },
  questionSmall: { fontSize: 12, color: '#7b8a7f', fontWeight: '700', marginBottom: 8 },
  questionTitle: { fontSize: 18, lineHeight: 25, fontWeight: '800', color: '#24352b' },
  optionCard: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#d8e1d7', paddingVertical: 15, paddingHorizontal: 14, marginBottom: 10 },
  optionCardActive: { backgroundColor: '#eff8f2', borderColor: '#1f6a45' },
  optionText: { fontSize: 14, fontWeight: '700', color: '#31443a' },
  optionTextActive: { color: '#1f6a45' },
  formLabel: { fontSize: 16, fontWeight: '800', color: '#24352b' },
  formHint: { fontSize: 13, color: '#6f7f73', marginTop: 4, marginBottom: 10 },
  orText: { alignSelf: 'center', fontSize: 13, color: '#758479', marginVertical: 8 },
  utilityCard: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#d8e1d7', padding: 16, marginBottom: 10 },
  utilityTitle: { fontSize: 16, fontWeight: '800', color: '#24352b' },
  utilitySub: { marginTop: 4, fontSize: 13, color: '#6d7d71' },
  secondaryButtonFull: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#cfd8cf', paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  secondaryButtonFullText: { color: '#2f4838', fontSize: 15, fontWeight: '700' },
  confirmTopCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#d8e1d7', padding: 20, alignItems: 'center', marginBottom: 14 },
  confirmTopText: { fontSize: 15, color: '#51645a', textAlign: 'center', fontWeight: '600' },
  confirmLabel: { fontSize: 16, fontWeight: '800', color: '#24352b', marginBottom: 10 },
  confirmTable: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#d8e1d7', paddingHorizontal: 14, marginBottom: 12 },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#edf1ed' },
  confirmKey: { fontSize: 13, color: '#76857a', fontWeight: '700' },
  confirmValue: { fontSize: 15, color: '#23342a', fontWeight: '800' },
  noticeBox: { backgroundColor: '#eaf7ee', borderRadius: 14, padding: 14, marginBottom: 12 },
  noticeText: { color: '#356149', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  bottomActions: { flexDirection: 'row', marginTop: 6 },
  outlineHalf: { flex: 1, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#cfd8cf', paddingVertical: 14, alignItems: 'center', marginRight: 6 },
  outlineHalfText: { color: '#31473a', fontSize: 14, fontWeight: '700' },
  fillHalf: { flex: 1, backgroundColor: '#1f6a45', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginLeft: 6 },
  fillHalfText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  medicineHeading: { fontSize: 18, fontWeight: '800', color: '#24352b', marginBottom: 10 },
  resultBanner: { backgroundColor: '#fff3dc', borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  resultBannerIcon: { fontSize: 24, marginRight: 12 },
  resultBannerTitle: { fontSize: 18, fontWeight: '800', color: '#895400' },
  resultBannerSub: { fontSize: 14, color: '#996d1c', marginTop: 2 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  scoreLabel: { fontSize: 14, color: '#55665b', fontWeight: '700', marginRight: 10 },
  scoreBarTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#e0e6df', overflow: 'hidden' },
  scoreBarFill: { height: '100%', backgroundColor: '#cb8a1a', borderRadius: 5 },
  scoreValue: { marginLeft: 10, fontSize: 14, fontWeight: '800', color: '#24352b' },
  infoCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#d8e1d7', padding: 16, marginBottom: 12 },
  infoTitle: { fontSize: 14, fontWeight: '800', color: '#55665b', marginBottom: 8 },
  infoText: { fontSize: 15, lineHeight: 22, color: '#23342a', fontWeight: '700' },
  recommendationCard: { borderRadius: 16, padding: 16, marginBottom: 12 },
  recommendationTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  recommendationText: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  warningPill: { backgroundColor: '#fff3dc' },
  warningPillText: { color: '#8d5a00' },
  safePill: { backgroundColor: '#e9f7ee' },
  safePillText: { color: '#1f6a45' },
  dangerPill: { backgroundColor: '#fde9e7' },
  dangerPillText: { color: '#9c2f2a' },
  historyCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#d8e1d7', padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyLeft: { flex: 1, paddingRight: 10 },
  historyTitle: { fontSize: 18, fontWeight: '800', color: '#23342a' },
  historyDate: { marginTop: 4, fontSize: 13, color: '#718176' },
  historyBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  historyBadgeText: { fontSize: 12, fontWeight: '800' },
  warningBadge: { backgroundColor: '#fff1d5' },
  safeBadge: { backgroundColor: '#e7f7ec' },
  dangerBadge: { backgroundColor: '#fce7e5' },
  warningBadgeText: { color: '#865600' },
  safeBadgeText: { color: '#1f6a45' },
  dangerBadgeText: { color: '#9b2f29' },
});
