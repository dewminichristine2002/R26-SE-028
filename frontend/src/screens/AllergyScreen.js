import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { allergyService } from '../services/allergyService';

const QUESTION_PROMPTS = [
  {
    key: 'pastReaction',
    label: 'Have you ever had an allergic reaction to medicine?',
    type: 'choice',
    options: ['Yes', 'No', 'Not sure'],
  },
  {
    key: 'reactionSymptoms',
    label: 'What happened?',
    type: 'choice',
    options: ['Skin rash', 'Swelling', 'Breathing trouble', 'Vomiting', 'Dizziness', 'Other'],
    detailKey: 'reactionSymptomsDetail',
    detailPlaceholder: 'Type a short note if needed.',
  },
  {
    key: 'medicineName',
    label: 'Do you remember the medicine name?',
    type: 'choice',
    options: ['Yes', 'No'],
    detailKey: 'medicineNameDetail',
    detailPlaceholder: 'Type the medicine name.',
  },
  {
    key: 'doctorAdvice',
    label: 'Did a doctor ask you to avoid any medicine?',
    type: 'choice',
    options: ['Yes', 'No'],
    detailKey: 'doctorAdviceDetail',
    detailPlaceholder: 'Type the medicine name if known.',
  },
  {
    key: 'painkillerAntibioticReaction',
    label: 'Have you reacted to antibiotics or painkillers before?',
    type: 'choice',
    options: ['Yes', 'No', 'Not sure'],
  },
];

const initialProfileState = {
  hasMedicineAllergy: null,
  knownAllergiesText: '',
  chronicDiseasesText: '',
  currentMedicationsText: '',
  pregnancyStatus: '',
  emergencyContact: '',
  caregiverDetails: '',
};

const initialMedicineCheckState = {
  inputMethod: 'manual',
  medicineName: '',
  normalizedDrugName: '',
  dose: '',
  frequency: '',
  takenBefore: null,
  symptomMatch: '',
  severity: 'mild',
  notes: '',
};

const normalizeQuestionnaireState = (answers = []) => {
  const nextState = {};
  QUESTION_PROMPTS.forEach((item) => {
    nextState[item.key] = '';
    if (item.detailKey) {
      nextState[item.detailKey] = '';
    }
  });

  answers.forEach((answer) => {
    if (nextState[answer.questionKey] !== undefined) {
      const config = QUESTION_PROMPTS.find((item) => item.key === answer.questionKey);
      const rawAnswer = answer.answerText || '';

      if (config?.detailKey && rawAnswer.includes(': ')) {
        const [baseAnswer, ...rest] = rawAnswer.split(': ');
        nextState[answer.questionKey] = baseAnswer;
        nextState[config.detailKey] = rest.join(': ');
      } else {
        nextState[answer.questionKey] = rawAnswer;
      }
    }
  });

  return nextState;
};

const getRiskTone = (riskLevel) => {
  if (riskLevel === 'Dangerous') {
    return {
      badge: styles.dangerBadge,
      badgeText: styles.dangerBadgeText,
      panel: styles.dangerPanel,
    };
  }

  if (riskLevel === 'Safe') {
    return {
      badge: styles.safeBadge,
      badgeText: styles.safeBadgeText,
      panel: styles.safePanel,
    };
  }

  return {
    badge: styles.warningBadge,
    badgeText: styles.warningBadgeText,
    panel: styles.warningPanel,
  };
};

const formatDate = (value) => {
  if (!value) {
    return 'No date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString();
};

const hasQuestionnaireAnswers = (questionnaire = {}) =>
  QUESTION_PROMPTS.some((item) => Boolean(questionnaire[item.key]));

const getErrorMessage = (error, fallback) => {
  if (error.response?.data?.error) {
    return error.response.data.error;
  }

  if (error.message === 'Network Error') {
    return 'Cannot reach the backend. Check that the backend is running, the phone and laptop are on the same Wi-Fi, and EXPO_PUBLIC_API_URL still points to your laptop IP.';
  }

  return error.message || fallback;
};

const AllergyScreen = ({ user, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingQuestions, setSavingQuestions] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeSection, setActiveSection] = useState('menu');
  const [profile, setProfile] = useState(initialProfileState);
  const [questionnaire, setQuestionnaire] = useState(normalizeQuestionnaireState());
  const [questionStepIndex, setQuestionStepIndex] = useState(0);
  const [needsQuestionnaire, setNeedsQuestionnaire] = useState(false);
  const [cards, setCards] = useState([]);
  const [history, setHistory] = useState([]);
  const [medicineCheck, setMedicineCheck] = useState(initialMedicineCheckState);

  const currentQuestion = QUESTION_PROMPTS[questionStepIndex];
  const sectionItems = [
    { key: 'profile', title: 'Health Profile', subtitle: 'Save medical details and caregiver support.' },
    { key: 'medicine', title: 'Check a Medicine', subtitle: 'Run a safety check with simple inputs.' },
    { key: 'cards', title: 'Safety Cards', subtitle: 'See saved medicine safety results.' },
    { key: 'history', title: 'Medicine History', subtitle: 'Review past medicine checks.' },
  ];

  const setupStatusKey = `eldermeds_allergy_setup_status_${user?.id || 'local-user'}`;

  const loadAllergyData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [profileData, questionnaireData, cardsData, historyData] = await Promise.all([
        allergyService.getProfile(),
        allergyService.getQuestionnaire(),
        allergyService.getCards(),
        allergyService.getHistory(),
      ]);

      setProfile({
        ...initialProfileState,
        ...profileData,
      });
      const normalizedQuestionnaire = normalizeQuestionnaireState(questionnaireData);
      setQuestionnaire(normalizedQuestionnaire);
      setCards(cardsData);
      setHistory(historyData);

      const setupStatus = await AsyncStorage.getItem(setupStatusKey);
      const hasSavedAnswers = hasQuestionnaireAnswers(normalizedQuestionnaire);
      const hasExistingUsage = cardsData.length > 0 || historyData.length > 0;
      const shouldAskQuestions = !hasSavedAnswers && !hasExistingUsage && setupStatus !== 'skipped';

      setNeedsQuestionnaire(shouldAskQuestions);

      if (shouldAskQuestions) {
        setActiveSection('medicine');
      }
    } catch (error) {
      const message = getErrorMessage(error, 'Could not load allergy data.');
      Alert.alert('Unable to load', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllergyData();
  }, []);

  const handleProfileSave = async () => {
    try {
      setSavingProfile(true);
      const saved = await allergyService.saveProfile(profile);
      setProfile({
        ...initialProfileState,
        ...saved,
      });
      Alert.alert('Saved', 'Health details saved for your allergy profile.');
    } catch (error) {
      const message = getErrorMessage(error, 'Could not save profile.');
      Alert.alert('Save failed', message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleQuestionnaireSave = async () => {
    try {
      setSavingQuestions(true);
      const answers = QUESTION_PROMPTS.map((item) => {
        const baseAnswer = questionnaire[item.key] || '';
        const detailAnswer = item.detailKey ? questionnaire[item.detailKey] || '' : '';
        const answerText = detailAnswer ? `${baseAnswer}: ${detailAnswer}` : baseAnswer;

        return {
          questionKey: item.key,
          answerText,
        };
      });
      const saved = await allergyService.saveQuestionnaire(answers);
      setQuestionnaire(normalizeQuestionnaireState(saved));
      setNeedsQuestionnaire(false);
      await AsyncStorage.setItem(setupStatusKey, 'completed');
      Alert.alert('Saved', 'Allergy questions saved. You can now check the medicine safety.');
    } catch (error) {
      const message = getErrorMessage(error, 'Could not save questionnaire.');
      Alert.alert('Save failed', message);
    } finally {
      setSavingQuestions(false);
    }
  };

  const handleSkipQuestionnaire = async () => {
    await AsyncStorage.setItem(setupStatusKey, 'skipped');
    setNeedsQuestionnaire(false);
    Alert.alert('Skipped', 'You can answer these later. Continue to the medicine check below.');
  };

  const updateMedicineCheck = (key, value) => {
    setMedicineCheck((prev) => ({ ...prev, [key]: value }));
  };

  const handleAnalyzeMedicine = async () => {
    if (!medicineCheck.medicineName.trim()) {
      Alert.alert('Missing medicine', 'Please type the medicine name first.');
      return;
    }

    try {
      setAnalyzing(true);
      const result = await allergyService.analyzeMedicine(medicineCheck);
      setCards((prev) => [result.card, ...prev]);
      const updatedHistory = await allergyService.getHistory();
      setHistory(updatedHistory);
      setMedicineCheck(initialMedicineCheckState);
      setNeedsQuestionnaire(false);
      await AsyncStorage.setItem(setupStatusKey, 'completed');
      Alert.alert(
        `Result: ${result.analysis.riskLevel}`,
        `Risk score: ${result.analysis.riskScore}\n\n${result.analysis.recommendation}`,
        [
          {
            text: 'View Safety Card',
            onPress: () => setActiveSection('cards'),
          },
        ]
      );
    } catch (error) {
      const message = getErrorMessage(error, 'Could not analyze medicine.');
      Alert.alert('Analysis failed', message);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingTitle}>Preparing your allergy safety page</Text>
        <Text style={styles.loadingText}>Please wait a moment.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Medicine Safety</Text>
        <Text style={styles.heroTitle}>Allergy Care for {user?.fullName || 'You'}</Text>
        <Text style={styles.heroSubtitle}>
          Large text, simple wording, and clear safety notes for everyday medicine checks.
        </Text>

        <View style={styles.heroActionRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => loadAllergyData(true)} disabled={refreshing}>
            <Text style={styles.primaryButtonText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeSection === 'menu' ? (
        <>
          <View style={styles.summaryStrip}>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryNumber}>{cards.length}</Text>
              <Text style={styles.summaryLabel}>Safety cards</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryNumber}>{history.length}</Text>
              <Text style={styles.summaryLabel}>Medicine checks</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryNumber}>{profile.hasMedicineAllergy === true ? 'Yes' : profile.hasMedicineAllergy === false ? 'No' : '--'}</Text>
              <Text style={styles.summaryLabel}>Known allergy</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Choose One Task</Text>
            <Text style={styles.sectionText}>
              Open one page at a time. This keeps the screen simple and easier to read.
            </Text>

            {sectionItems.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.menuButton}
                onPress={() => setActiveSection(item.key)}
                activeOpacity={0.88}
              >
                <Text style={styles.menuButtonTitle}>{item.title}</Text>
                <Text style={styles.menuButtonSubtitle}>{item.subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {activeSection !== 'menu' ? (
        <TouchableOpacity style={styles.sectionBackButton} onPress={() => setActiveSection('menu')}>
          <Text style={styles.sectionBackButtonText}>Back to Allergy Menu</Text>
        </TouchableOpacity>
      ) : null}

      {activeSection === 'profile' ? (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>1. Health Profile</Text>
        <Text style={styles.sectionText}>
          Save the important health details that help the allergy checks make sense.
        </Text>

        <Text style={styles.label}>Do you have a known medicine allergy?</Text>
        <View style={styles.choiceRow}>
          <TouchableOpacity
            style={[styles.choiceButton, profile.hasMedicineAllergy === true && styles.choiceButtonActive]}
            onPress={() => setProfile((prev) => ({ ...prev, hasMedicineAllergy: true }))}
          >
            <Text style={[styles.choiceButtonText, profile.hasMedicineAllergy === true && styles.choiceButtonTextActive]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceButton, profile.hasMedicineAllergy === false && styles.choiceButtonActive]}
            onPress={() => setProfile((prev) => ({ ...prev, hasMedicineAllergy: false }))}
          >
            <Text style={[styles.choiceButtonText, profile.hasMedicineAllergy === false && styles.choiceButtonTextActive]}>No</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Known Allergies</Text>
        <TextInput
          style={[styles.input, styles.largeInput]}
          value={profile.knownAllergiesText}
          onChangeText={(value) => setProfile((prev) => ({ ...prev, knownAllergiesText: value }))}
          placeholder="Example: Penicillin, aspirin, or a reaction to pain medicine."
          multiline
        />

        <Text style={styles.label}>Chronic Diseases</Text>
        <TextInput
          style={[styles.input, styles.largeInput]}
          value={profile.chronicDiseasesText}
          onChangeText={(value) => setProfile((prev) => ({ ...prev, chronicDiseasesText: value }))}
          placeholder="Example: Diabetes, kidney disease, asthma."
          multiline
        />

        <Text style={styles.label}>Current Medicines</Text>
        <TextInput
          style={[styles.input, styles.largeInput]}
          value={profile.currentMedicationsText}
          onChangeText={(value) => setProfile((prev) => ({ ...prev, currentMedicationsText: value }))}
          placeholder="List medicines you take now."
          multiline
        />

        <Text style={styles.label}>Pregnancy Status</Text>
        <TextInput
          style={styles.input}
          value={profile.pregnancyStatus}
          onChangeText={(value) => setProfile((prev) => ({ ...prev, pregnancyStatus: value }))}
          placeholder="If not applicable, leave blank."
        />

        <Text style={styles.label}>Emergency Contact</Text>
        <TextInput
          style={styles.input}
          value={profile.emergencyContact}
          onChangeText={(value) => setProfile((prev) => ({ ...prev, emergencyContact: value }))}
          placeholder="Phone number or name."
        />

        <Text style={styles.label}>Caregiver Details</Text>
        <TextInput
          style={styles.input}
          value={profile.caregiverDetails}
          onChangeText={(value) => setProfile((prev) => ({ ...prev, caregiverDetails: value }))}
          placeholder="Name or relation, if someone helps you."
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleProfileSave} disabled={savingProfile}>
          <Text style={styles.saveButtonText}>{savingProfile ? 'Saving...' : 'Save Health Profile'}</Text>
        </TouchableOpacity>
      </View>
      ) : null}

      {activeSection === 'medicine' ? (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>2. Check a Medicine</Text>
        <Text style={styles.sectionText}>
          {needsQuestionnaire
            ? 'Because this is a new allergy setup, answer these short questions first. You can also skip them for now.'
            : 'Enter the medicine details below. Your saved allergy history will be used automatically.'}
        </Text>

        {needsQuestionnaire ? (
          <>
            <View style={styles.questionStepper}>
              <Text style={styles.stepCounter}>
                Allergy question {questionStepIndex + 1} of {QUESTION_PROMPTS.length}
              </Text>
              <Text style={styles.questionLabel}>{currentQuestion.label}</Text>

              <View style={styles.choiceRow}>
                {currentQuestion.options.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.choiceButton, questionnaire[currentQuestion.key] === option && styles.choiceButtonActive]}
                    onPress={() => setQuestionnaire((prev) => ({ ...prev, [currentQuestion.key]: option }))}
                  >
                    <Text
                      style={[
                        styles.choiceButtonText,
                        questionnaire[currentQuestion.key] === option && styles.choiceButtonTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {currentQuestion.detailKey
                && (
                  (currentQuestion.key === 'reactionSymptoms' && questionnaire[currentQuestion.key] === 'Other')
                  || (currentQuestion.key === 'medicineName' && questionnaire[currentQuestion.key] === 'Yes')
                  || (currentQuestion.key === 'doctorAdvice' && questionnaire[currentQuestion.key] === 'Yes')
                ) ? (
                  <TextInput
                    style={[styles.input, styles.questionInput]}
                    value={questionnaire[currentQuestion.detailKey]}
                    onChangeText={(value) => setQuestionnaire((prev) => ({ ...prev, [currentQuestion.detailKey]: value }))}
                    placeholder={currentQuestion.detailPlaceholder}
                    multiline
                  />
                ) : null}

              <View style={styles.questionNavRow}>
                <TouchableOpacity
                  style={[styles.secondaryButtonSmall, questionStepIndex === 0 && styles.disabledButton]}
                  onPress={() => setQuestionStepIndex((prev) => Math.max(0, prev - 1))}
                  disabled={questionStepIndex === 0}
                >
                  <Text style={styles.secondaryButtonSmallText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButtonSmall, questionStepIndex === QUESTION_PROMPTS.length - 1 && styles.disabledButton]}
                  onPress={() => setQuestionStepIndex((prev) => Math.min(QUESTION_PROMPTS.length - 1, prev + 1))}
                  disabled={questionStepIndex === QUESTION_PROMPTS.length - 1}
                >
                  <Text style={styles.primaryButtonSmallText}>
                    {questionStepIndex === QUESTION_PROMPTS.length - 1 ? 'Last Question' : 'Next'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleQuestionnaireSave} disabled={savingQuestions}>
              <Text style={styles.saveButtonText}>{savingQuestions ? 'Saving...' : 'Save Allergy Answers'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.skipButton} onPress={handleSkipQuestionnaire}>
              <Text style={styles.skipButtonText}>Skip for Now</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <Text style={styles.label}>Medicine Name</Text>
        <TextInput
          style={styles.input}
          value={medicineCheck.medicineName}
          onChangeText={(value) => updateMedicineCheck('medicineName', value)}
          placeholder="Example: Amoxicillin"
        />

        <Text style={styles.label}>Normalized Name</Text>
        <TextInput
          style={styles.input}
          value={medicineCheck.normalizedDrugName}
          onChangeText={(value) => updateMedicineCheck('normalizedDrugName', value)}
          placeholder="Example: amoxicillin"
        />

        <View style={styles.inlineRow}>
          <View style={styles.inlineField}>
            <Text style={styles.label}>Dose</Text>
            <TextInput
              style={styles.input}
              value={medicineCheck.dose}
              onChangeText={(value) => updateMedicineCheck('dose', value)}
              placeholder="500 mg"
            />
          </View>
          <View style={styles.inlineField}>
            <Text style={styles.label}>Frequency</Text>
            <TextInput
              style={styles.input}
              value={medicineCheck.frequency}
              onChangeText={(value) => updateMedicineCheck('frequency', value)}
              placeholder="2 times a day"
            />
          </View>
        </View>

        <Text style={styles.label}>Have you taken this medicine before?</Text>
        <View style={styles.choiceRow}>
          <TouchableOpacity
            style={[styles.choiceButton, medicineCheck.takenBefore === true && styles.choiceButtonActive]}
            onPress={() => updateMedicineCheck('takenBefore', true)}
          >
            <Text style={[styles.choiceButtonText, medicineCheck.takenBefore === true && styles.choiceButtonTextActive]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceButton, medicineCheck.takenBefore === false && styles.choiceButtonActive]}
            onPress={() => updateMedicineCheck('takenBefore', false)}
          >
            <Text style={[styles.choiceButtonText, medicineCheck.takenBefore === false && styles.choiceButtonTextActive]}>No</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Symptoms or Concerns</Text>
        <TextInput
          style={[styles.input, styles.largeInput]}
          value={medicineCheck.symptomMatch}
          onChangeText={(value) => updateMedicineCheck('symptomMatch', value)}
          placeholder="Example: Rash, breathing trouble, stomach pain."
          multiline
        />

        <Text style={styles.label}>How serious was the reaction?</Text>
        <View style={styles.choiceRow}>
          {['mild', 'moderate', 'severe'].map((level) => (
            <TouchableOpacity
              key={level}
              style={[styles.choiceButton, medicineCheck.severity === level && styles.choiceButtonActive]}
              onPress={() => updateMedicineCheck('severity', level)}
            >
              <Text style={[styles.choiceButtonText, medicineCheck.severity === level && styles.choiceButtonTextActive]}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Extra Notes</Text>
        <TextInput
          style={[styles.input, styles.largeInput]}
          value={medicineCheck.notes}
          onChangeText={(value) => updateMedicineCheck('notes', value)}
          placeholder="Any extra detail you want saved with this check."
          multiline
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleAnalyzeMedicine} disabled={analyzing}>
          <Text style={styles.saveButtonText}>{analyzing ? 'Checking Medicine...' : 'Check Medicine Safety'}</Text>
        </TouchableOpacity>
      </View>
      ) : null}

      {activeSection === 'cards' ? (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>3. Safety Cards</Text>
        <Text style={styles.sectionText}>
          Easy-to-read cards for the most important medicine safety notes.
        </Text>

        {cards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No cards yet</Text>
            <Text style={styles.emptyStateText}>
              Use the medicine check above. A safety card will appear here automatically.
            </Text>
          </View>
        ) : (
          cards.map((card) => {
            const tone = getRiskTone(card.riskLevel);

            return (
              <View key={card.id} style={[styles.resultCard, tone.panel]}>
                <View style={styles.resultHeaderRow}>
                  <Text style={styles.resultTitle}>{card.title}</Text>
                  <View style={[styles.statusBadge, tone.badge]}>
                    <Text style={[styles.statusBadgeText, tone.badgeText]}>{card.riskLevel || 'Review'}</Text>
                  </View>
                </View>

                <Text style={styles.resultMedicine}>{card.medicineName || 'No medicine name added'}</Text>
                <Text style={styles.resultMeta}>Score: {card.riskScore ?? '--'}</Text>
                <Text style={styles.resultBody}>{card.explanation || 'No explanation saved yet.'}</Text>
                <Text style={styles.resultRecommendation}>{card.recommendation || 'No recommendation saved yet.'}</Text>

                {Array.isArray(card.riskFactors) && card.riskFactors.length > 0 ? (
                  <View style={styles.factorWrap}>
                    {card.riskFactors.map((factor) => (
                      <View key={factor.id || `${card.id}-${factor.factorLabel}`} style={styles.factorPill}>
                        <Text style={styles.factorText}>{factor.factorLabel}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
      ) : null}

      {activeSection === 'history' ? (
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>4. Medicine Check History</Text>
        <Text style={styles.sectionText}>
          A simple list of the medicine checks saved in your allergy area.
        </Text>

        {history.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No history yet</Text>
            <Text style={styles.emptyStateText}>When you check a medicine, the result will appear here.</Text>
          </View>
        ) : (
          history.map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <View style={styles.historyTextWrap}>
                <Text style={styles.historyTitle}>{item.medicineName || 'Unnamed medicine'}</Text>
                <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
              </View>
              <View style={[styles.historyBadge, getRiskTone(item.riskLevel).badge]}>
                <Text style={[styles.historyBadgeText, getRiskTone(item.riskLevel).badgeText]}>
                  {item.riskLevel || 'Saved'}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f3f7f1',
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 36,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: '#f3f7f1',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    color: '#1d4833',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 18,
    lineHeight: 26,
    color: '#507160',
    textAlign: 'center',
  },
  heroCard: {
    backgroundColor: '#fff9ef',
    borderRadius: 28,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#edd8b0',
    shadowColor: '#6d5c35',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroEyebrow: {
    fontSize: 14,
    color: '#8a5a00',
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: '#234230',
  },
  heroSubtitle: {
    marginTop: 12,
    fontSize: 18,
    lineHeight: 26,
    color: '#526d5b',
  },
  heroActionRow: {
    flexDirection: 'row',
    marginTop: 18,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2f7d57',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginRight: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#cad7ce',
  },
  secondaryButtonText: {
    color: '#2d5841',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#dbe6dd',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#234230',
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 13,
    color: '#557161',
    fontWeight: '600',
    textAlign: 'center',
  },
  menuButton: {
    borderRadius: 20,
    backgroundColor: '#f6faf6',
    borderWidth: 1,
    borderColor: '#d7e3d8',
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  menuButtonTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#1d4833',
  },
  menuButtonSubtitle: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 23,
    color: '#5d7667',
  },
  sectionBackButton: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cad7ce',
    paddingVertical: 14,
    alignItems: 'center',
  },
  sectionBackButtonText: {
    color: '#2d5841',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionCard: {
    marginTop: 18,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#365541',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 28,
    lineHeight: 34,
    color: '#1d4833',
    fontWeight: '800',
  },
  sectionText: {
    marginTop: 8,
    marginBottom: 12,
    fontSize: 17,
    lineHeight: 24,
    color: '#587262',
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 17,
    lineHeight: 22,
    color: '#365541',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cfdcce',
    borderRadius: 18,
    backgroundColor: '#fbfdfb',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    lineHeight: 24,
    color: '#1f3327',
  },
  largeInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  inlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inlineField: {
    width: '48%',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  choiceButton: {
    minWidth: 90,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#cad7ce',
    backgroundColor: '#f6faf6',
    marginRight: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  choiceButtonActive: {
    backgroundColor: '#2f7d57',
    borderColor: '#2f7d57',
  },
  choiceButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#345341',
  },
  choiceButtonTextActive: {
    color: '#ffffff',
  },
  saveButton: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: '#1f6a45',
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 19,
    fontWeight: '800',
  },
  skipButton: {
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cad7ce',
    paddingVertical: 15,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#2d5841',
    fontSize: 18,
    fontWeight: '700',
  },
  questionBlock: {
    marginBottom: 10,
  },
  questionStepper: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe6dd',
    backgroundColor: '#f8fbf7',
    padding: 16,
  },
  stepCounter: {
    fontSize: 15,
    lineHeight: 20,
    color: '#5c7666',
    fontWeight: '700',
    marginBottom: 8,
  },
  questionLabel: {
    marginBottom: 6,
    fontSize: 18,
    lineHeight: 25,
    color: '#365541',
    fontWeight: '700',
  },
  questionInput: {
    minHeight: 82,
    textAlignVertical: 'top',
    marginTop: 8,
  },
  questionNavRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  primaryButtonSmall: {
    flex: 1,
    backgroundColor: '#2f7d57',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginLeft: 6,
  },
  primaryButtonSmallText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButtonSmall: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#cad7ce',
  },
  secondaryButtonSmallText: {
    color: '#2d5841',
    fontSize: 17,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.45,
  },
  emptyState: {
    borderRadius: 18,
    backgroundColor: '#f7faf6',
    borderWidth: 1,
    borderColor: '#dbe6dd',
    padding: 18,
  },
  emptyStateTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: '#284534',
    fontWeight: '800',
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 24,
    color: '#5b7464',
  },
  resultCard: {
    marginTop: 12,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  resultHeaderRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  resultTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: '#1f3327',
    width: '100%',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  resultMedicine: {
    marginTop: 10,
    fontSize: 19,
    lineHeight: 24,
    color: '#2d4a38',
    fontWeight: '700',
  },
  resultMeta: {
    marginTop: 6,
    fontSize: 16,
    color: '#53705e',
    fontWeight: '600',
  },
  resultBody: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 24,
    color: '#2a4133',
  },
  resultRecommendation: {
    marginTop: 10,
    fontSize: 17,
    lineHeight: 24,
    color: '#1f5c3d',
    fontWeight: '700',
  },
  factorWrap: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  factorPill: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d3ddd4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  factorText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#415a4b',
    fontWeight: '600',
  },
  historyRow: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d8e5d9',
    backgroundColor: '#fbfdfb',
    padding: 14,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  historyTextWrap: {
    width: '100%',
  },
  historyTitle: {
    fontSize: 19,
    lineHeight: 24,
    color: '#1f3327',
    fontWeight: '700',
  },
  historyDate: {
    marginTop: 4,
    fontSize: 15,
    color: '#657f6e',
  },
  historyBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  historyBadgeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  safePanel: {
    backgroundColor: '#edf8ef',
    borderColor: '#cde8d1',
  },
  warningPanel: {
    backgroundColor: '#fff8e8',
    borderColor: '#f0dfac',
  },
  dangerPanel: {
    backgroundColor: '#fff0ee',
    borderColor: '#efc4bc',
  },
  safeBadge: {
    backgroundColor: '#d8f1dd',
  },
  safeBadgeText: {
    color: '#1f6a45',
  },
  warningBadge: {
    backgroundColor: '#ffe8aa',
  },
  warningBadgeText: {
    color: '#9a6500',
  },
  dangerBadge: {
    backgroundColor: '#ffd6cf',
  },
  dangerBadgeText: {
    color: '#9a2f25',
  },
});

export default AllergyScreen;
