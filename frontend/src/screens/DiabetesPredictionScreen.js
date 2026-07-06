import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import diabetesPredictionService from '../services/diabetesPredictionService';
import healthAdviceService from '../services/healthAdviceService';

const emptyForm = {
  age: '',
  gender: '',
  bloodSugar: '',
  bloodPressure: '',
  systolicBP: '',
  diastolicBP: '',
  height: '',
  weight: '',
  smokingStatus: 'No',
  physicalActivityLevel: 'Medium',
  familyHistory: 'No',
  existingDiseaseHistory: '',
};

const choiceFields = [
  {
    key: 'gender',
    label: 'Gender',
    options: ['Female', 'Male'],
  },
  {
    key: 'smokingStatus',
    label: 'Smoking Status',
    options: ['No', 'Yes'],
  },
  {
    key: 'physicalActivityLevel',
    label: 'Physical Activity',
    options: ['Low', 'Medium', 'High'],
  },
  {
    key: 'familyHistory',
    label: 'Family History',
    options: ['No', 'Yes'],
  },
];

const riskThemes = {
  Low: {
    background: '#DCFCE7',
    border: '#86EFAC',
    text: '#166534',
    soft: '#F0FDF4',
  },
  Medium: {
    background: '#FEF3C7',
    border: '#FCD34D',
    text: '#92400E',
    soft: '#FFFBEB',
  },
  High: {
    background: '#FEE2E2',
    border: '#FCA5A5',
    text: '#991B1B',
    soft: '#FEF2F2',
  },
  Unknown: {
    background: '#E0F2FE',
    border: '#7DD3FC',
    text: '#075985',
    soft: '#F0F9FF',
  },
};

const normalizeOption = (value, options, fallback = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return options.find((option) => option.toLowerCase() === normalized) || fallback;
};

const normalizeFormChoices = (values) => ({
  ...values,
  gender: normalizeOption(values.gender, ['Female', 'Male'], values.gender || ''),
  smokingStatus: normalizeOption(values.smokingStatus, ['No', 'Yes'], 'No'),
  physicalActivityLevel: normalizeOption(values.physicalActivityLevel, ['Low', 'Medium', 'High'], 'Medium'),
  familyHistory: normalizeOption(values.familyHistory, ['No', 'Yes'], 'No'),
});

const toNumberOrNull = (value) => {
  if (value == null || String(value).trim() === '') {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatBloodPressure = (systolic, diastolic) => {
  if (systolic == null || diastolic == null || systolic === '' || diastolic === '') {
    return '';
  }

  return `${systolic}/${diastolic}`;
};

const parseBloodPressure = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return { systolicBP: null, diastolicBP: null };
  }

  const match = text.match(/(\d{2,3})\s*(?:\/|over|-|\s+)\s*(\d{2,3})/i);
  if (!match) {
    return { systolicBP: null, diastolicBP: null };
  }

  return {
    systolicBP: Number(match[1]),
    diastolicBP: Number(match[2]),
  };
};

const formatValue = (value, suffix = '') => {
  if (value == null || value === '') {
    return '--';
  }
  return `${value}${suffix}`;
};

const getRiskTheme = (riskLevel) => riskThemes[riskLevel] || riskThemes.Unknown;

const ChoiceGroup = ({ value, options, onChange }) => (
  <View style={styles.choiceRow}>
    {options.map((option) => {
      const selected = value === option;
      return (
        <Pressable
          key={option}
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          onPress={() => onChange(option)}
          style={[styles.choiceButton, selected && styles.choiceButtonActive]}
        >
          <View style={[styles.radioOuter, selected && styles.radioOuterActive]}>
            {selected ? <View style={styles.radioInner} /> : null}
          </View>
          <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{option}</Text>
        </Pressable>
      );
    })}
  </View>
);

const MetricTile = ({ label, value }) => (
  <View style={styles.metricTile}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const ADVICE_PROMPTS = [
  'How can I reduce this risk?',
  'Why is this risk high?',
  'What should my caregiver monitor?',
];

const isAdviceQuestion = (message) => /\b(advice|reduce|lower|prevent|why|what\s+should|how\s+can|caregiver|monitor|healthy|lifestyle)\b/i.test(String(message || ''));

const DiabetesPredictionScreen = ({ user, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [screenMode, setScreenMode] = useState('chat');
  const [form, setForm] = useState(emptyForm);
  const [context, setContext] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [messages, setMessages] = useState([]);

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const data = await diabetesPredictionService.getContext();
      setContext(data);
      const health = data?.health || {};
      setForm(normalizeFormChoices({
        age: health.age != null ? String(health.age) : '',
        gender: health.gender || '',
        bloodSugar: health.bloodSugar != null ? String(health.bloodSugar) : '',
        bloodPressure: formatBloodPressure(health.systolicBP, health.diastolicBP),
        systolicBP: health.systolicBP != null ? String(health.systolicBP) : '',
        diastolicBP: health.diastolicBP != null ? String(health.diastolicBP) : '',
        height: health.height != null ? String(health.height) : '',
        weight: health.weight != null ? String(health.weight) : '',
        smokingStatus: health.smokingStatus || 'No',
        physicalActivityLevel: health.physicalActivityLevel || 'Medium',
        familyHistory: health.familyHistory || 'No',
        existingDiseaseHistory: Array.isArray(health.existingDiseaseHistory)
          ? health.existingDiseaseHistory.join(', ')
          : '',
      }));

      if (health.lastPrediction) {
        setResult({
          riskType: health.lastPrediction.riskType,
          riskLevel: health.lastPrediction.riskLevel,
          confidence: health.lastPrediction.confidence,
          selectedAlgorithm: health.lastPrediction.selectedAlgorithm,
          factors: health.lastPrediction.factors || [],
          summary: health.lastPrediction.summary,
        });
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to load diabetes data';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const payload = useMemo(() => {
    const diseases = String(form.existingDiseaseHistory || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const bloodPressureText = String(form.bloodPressure || '').trim();
    const parsedBloodPressure = parseBloodPressure(bloodPressureText);

    return {
      age: toNumberOrNull(form.age),
      gender: form.gender || null,
      bloodSugar: toNumberOrNull(form.bloodSugar),
      systolicBP: bloodPressureText ? parsedBloodPressure.systolicBP : toNumberOrNull(form.systolicBP),
      diastolicBP: bloodPressureText ? parsedBloodPressure.diastolicBP : toNumberOrNull(form.diastolicBP),
      height: toNumberOrNull(form.height),
      weight: toNumberOrNull(form.weight),
      smokingStatus: form.smokingStatus || 'No',
      physicalActivityLevel: form.physicalActivityLevel || 'Medium',
      familyHistory: form.familyHistory || 'No',
      existingDiseaseHistory: diseases,
      medicationAdherence: context?.health?.medicationAdherence ?? null,
    };
  }, [form, context?.health?.medicationAdherence]);

  const localBmi = useMemo(() => {
    if (!payload.height || !payload.weight) {
      return null;
    }
    const meters = payload.height / 100;
    if (!meters) {
      return null;
    }
    return Number((payload.weight / (meters * meters)).toFixed(2));
  }, [payload.height, payload.weight]);

  const displayName = useMemo(() => {
    const name = user?.fullName || context?.user?.fullName || '';
    return String(name).trim().split(/\s+/)[0] || 'there';
  }, [user?.fullName, context?.user?.fullName]);

  const riskLevel = result?.riskLevel || context?.health?.lastPrediction?.riskLevel || 'Unknown';
  const riskTheme = getRiskTheme(riskLevel);
  const factors = Array.isArray(result?.factors) ? result.factors : [];
  const summary = result?.summary || context?.health?.lastPrediction?.summary || '';
  const chatMessages = messages.length
    ? messages
    : [{ role: 'assistant', text: 'Hello, I am ready when you are.' }];
  const latestPredictionContext = useMemo(() => ({
    diabetes: {
      risk: riskLevel,
      riskLevel,
      confidence: result?.confidence || context?.health?.lastPrediction?.confidence || null,
      selectedAlgorithm: result?.selectedAlgorithm || context?.health?.lastPrediction?.selectedAlgorithm || '',
      factors,
      summary,
    },
  }), [context?.health?.lastPrediction?.confidence, context?.health?.lastPrediction?.selectedAlgorithm, factors, result?.confidence, result?.selectedAlgorithm, riskLevel, summary]);

  const runDiabetesCheck = useCallback(async (returnToChat = false) => {
    setPredicting(true);
    try {
      const response = await diabetesPredictionService.predict(payload, conversationId);
      setResult(response);
      if (response.conversationId) {
        setConversationId(response.conversationId);
      }
      if (response.summary) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: response.summary,
          },
        ]);
      }
      if (returnToChat) {
        setScreenMode('chat');
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to run diabetes prediction';
      Alert.alert('Prediction failed', msg);
    } finally {
      setPredicting(false);
    }
  }, [payload, conversationId]);

  const onSendChat = useCallback(async () => {
    const message = String(chatInput || '').trim();
    if (!message || chatLoading) {
      return;
    }

    setChatInput('');
    setMessages((prev) => [...prev, { role: 'user', text: message }]);
    setChatLoading(true);

    try {
      if (isAdviceQuestion(message)) {
        const advice = await healthAdviceService.ask({
          question: message,
          riskType: 'Diabetes',
          latestPrediction: latestPredictionContext,
          conversationId,
        });
        if (advice.conversationId) {
          setConversationId(advice.conversationId);
        }
        setMessages((prev) => [...prev, {
          role: 'assistant',
          text: advice.answer,
          sources: advice.sources || [],
          safetyNote: advice.safetyNote || '',
        }]);
        return;
      }

      const response = await diabetesPredictionService.chat(message, conversationId);
      if (response.conversationId) {
        setConversationId(response.conversationId);
      }
      if (response.updatedValues && Object.keys(response.updatedValues).length) {
        setForm((prev) => {
          const nextSystolic = response.updatedValues.systolicBP != null
            ? String(response.updatedValues.systolicBP)
            : prev.systolicBP;
          const nextDiastolic = response.updatedValues.diastolicBP != null
            ? String(response.updatedValues.diastolicBP)
            : prev.diastolicBP;

          return normalizeFormChoices({
            ...prev,
            ...(response.updatedValues.bloodSugar != null ? { bloodSugar: String(response.updatedValues.bloodSugar) } : {}),
            systolicBP: nextSystolic,
            diastolicBP: nextDiastolic,
            bloodPressure: formatBloodPressure(nextSystolic, nextDiastolic) || prev.bloodPressure,
            ...(response.updatedValues.height != null ? { height: String(response.updatedValues.height) } : {}),
            ...(response.updatedValues.weight != null ? { weight: String(response.updatedValues.weight) } : {}),
            ...(response.updatedValues.smokingStatus ? { smokingStatus: response.updatedValues.smokingStatus } : {}),
            ...(response.updatedValues.physicalActivityLevel ? { physicalActivityLevel: response.updatedValues.physicalActivityLevel } : {}),
            ...(response.updatedValues.familyHistory ? { familyHistory: response.updatedValues.familyHistory } : {}),
          });
        });
      }

      if (response.prediction) {
        setResult(response.prediction);
      }

      if (response.reply) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          text: response.reply,
          sources: response.sources || response.advice?.sources || [],
          safetyNote: response.safetyNote || response.advice?.safetyNote || '',
        }]);
      }
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to process chat update';
      setMessages((prev) => [...prev, { role: 'assistant', text: `Sorry, ${msg}` }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, conversationId, latestPredictionContext]);

  const onAskAdvice = useCallback(async (prompt) => {
    if (adviceLoading) {
      return;
    }

    setMessages((prev) => [...prev, { role: 'user', text: prompt }]);
    setAdviceLoading(true);
    try {
      const advice = await healthAdviceService.ask({
        question: prompt,
        riskType: 'Diabetes',
        latestPrediction: latestPredictionContext,
        conversationId,
      });
      if (advice.conversationId) {
        setConversationId(advice.conversationId);
      }
      setMessages((prev) => [...prev, {
        role: 'assistant',
        text: advice.answer,
        sources: advice.sources || [],
        safetyNote: advice.safetyNote || '',
      }]);
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Failed to get trusted advice';
      setMessages((prev) => [...prev, { role: 'assistant', text: `Sorry, ${msg}` }]);
    } finally {
      setAdviceLoading(false);
    }
  }, [adviceLoading, conversationId, latestPredictionContext]);

  const renderNumberInput = (key, label, placeholder, unit = '') => (
    <View style={styles.inputWrap} key={key}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          value={String(form[key] || '')}
          onChangeText={(value) => setForm((prev) => ({ ...prev, [key]: value }))}
          style={[styles.input, styles.inputShellInput]}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
        />
        {unit ? <Text style={styles.unitText}>{unit}</Text> : null}
      </View>
    </View>
  );

  const renderBloodPressureInput = () => (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>Blood Pressure</Text>
      <View style={styles.inputShell}>
        <TextInput
          value={String(form.bloodPressure || '')}
          onChangeText={(value) => {
            const parsed = parseBloodPressure(value);
            const isEmpty = String(value || '').trim() === '';
            setForm((prev) => ({
              ...prev,
              bloodPressure: value,
              ...(parsed.systolicBP != null && parsed.diastolicBP != null
                ? {
                    systolicBP: String(parsed.systolicBP),
                    diastolicBP: String(parsed.diastolicBP),
                  }
                : {}),
              ...(isEmpty ? { systolicBP: '', diastolicBP: '' } : {}),
            }));
          }}
          style={[styles.input, styles.inputShellInput]}
          placeholder="120/80"
          placeholderTextColor="#9CA3AF"
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.unitText}>mmHg</Text>
      </View>
    </View>
  );

  const renderHealthForm = () => (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => setScreenMode('chat')} style={styles.backButton}>
            <Text style={styles.backText}>{'< Chat'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Update Health Values</Text>
        </View>

        <View style={styles.formIntro}>
          <Text style={styles.formIntroTitle}>One step at a time</Text>
          <Text style={styles.formIntroText}>
            Fill what you know. Empty boxes can stay empty.
          </Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>Basic Details</Text>
          {renderNumberInput('age', 'Age', 'Age', 'years')}
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Gender</Text>
            <ChoiceGroup
              value={form.gender}
              options={['Female', 'Male']}
              onChange={(value) => setForm((prev) => ({ ...prev, gender: value }))}
            />
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>Today</Text>
          {renderNumberInput('bloodSugar', 'Blood Sugar', 'Blood sugar', 'mg/dL')}
          {renderBloodPressureInput()}
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>Body</Text>
          {renderNumberInput('height', 'Height', 'Height', 'cm')}
          {renderNumberInput('weight', 'Weight', 'Weight', 'kg')}
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>Daily Habits</Text>
          {choiceFields.slice(1).map((field) => (
            <View key={field.key} style={styles.inputWrap}>
              <Text style={styles.inputLabel}>{field.label}</Text>
              <ChoiceGroup
                value={form[field.key]}
                options={field.options}
                onChange={(value) => setForm((prev) => ({ ...prev, [field.key]: value }))}
              />
            </View>
          ))}
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>Health History</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Existing Disease History</Text>
            <TextInput
              value={String(form.existingDiseaseHistory || '')}
              onChangeText={(value) => setForm((prev) => ({ ...prev, existingDiseaseHistory: value }))}
              style={[styles.input, styles.multilineInput]}
              placeholder="Example: hypertension, stroke"
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </View>
        </View>

        <Pressable
          style={[styles.primaryButton, predicting && styles.disabledButton]}
          onPress={() => runDiabetesCheck(true)}
          disabled={predicting}
        >
          <Text style={styles.primaryButtonText}>
            {predicting ? 'Checking...' : 'Save and Check Risk'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );

  const renderChatScreen = () => (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>{'< Back'}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Diabetes Helper</Text>
        </View>

        <View style={[styles.riskPanel, { backgroundColor: riskTheme.soft, borderColor: riskTheme.border }]}>
          <Text style={styles.welcomeText}>Hi {displayName}</Text>
          <Text style={styles.riskLabel}>Current diabetes risk</Text>
          <View style={[styles.riskBadge, { backgroundColor: riskTheme.background, borderColor: riskTheme.border }]}>
            <Text style={[styles.riskBadgeText, { color: riskTheme.text }]}>{riskLevel}</Text>
          </View>
          {result?.confidence != null ? (
            <Text style={styles.confidenceText}>{result.confidence}% confidence</Text>
          ) : (
            <Text style={styles.confidenceText}>Update values to check today's risk.</Text>
          )}
          {summary ? <Text style={styles.summaryText}>{summary}</Text> : null}
        </View>

        <Pressable
          style={styles.primaryButton}
          onPress={() => setScreenMode('form')}
          disabled={predicting}
        >
          <Text style={styles.primaryButtonText}>Update Health Values</Text>
        </Pressable>

        <View style={styles.advicePanel}>
          <Text style={styles.adviceTitle}>Ask trusted advice</Text>
          <View style={styles.adviceChipRow}>
            {ADVICE_PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                onPress={() => onAskAdvice(prompt)}
                disabled={adviceLoading}
                style={[styles.adviceChip, adviceLoading && styles.disabledButton]}
              >
                <Text style={styles.adviceChipText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.snapshotPanel}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Today's Snapshot</Text>
            <Pressable onPress={() => runDiabetesCheck(false)} disabled={predicting}>
              <Text style={styles.textButton}>{predicting ? 'Checking...' : 'Check again'}</Text>
            </Pressable>
          </View>
          <View style={styles.metricGrid}>
            <MetricTile label="Sugar" value={formatValue(payload.bloodSugar, ' mg/dL')} />
            <MetricTile
              label="Blood Pressure"
              value={payload.systolicBP != null && payload.diastolicBP != null
                ? `${payload.systolicBP}/${payload.diastolicBP}`
                : '--'}
            />
            <MetricTile label="Weight" value={formatValue(payload.weight, ' kg')} />
            <MetricTile label="Height" value={formatValue(payload.height, ' cm')} />
            <MetricTile label="BMI" value={formatValue(localBmi)} />
          </View>
          {factors.length ? (
            <View style={styles.factorRow}>
              {factors.map((factor) => (
                <View key={factor} style={styles.factorChip}>
                  <Text style={styles.factorText}>{factor}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.chatPanel}>
          <Text style={styles.sectionTitle}>Diabetes Assistant Chat</Text>
          <View style={styles.chatBox}>
            {chatMessages.map((message, index) => (
              <View
                key={`${message.role}-${index}`}
                style={[
                  styles.chatBubble,
                  message.role === 'user' ? styles.chatUser : styles.chatAssistant,
                ]}
              >
                <Text style={styles.chatText}>{message.text}</Text>
                {Array.isArray(message.sources) && message.sources.length ? (
                  <View style={styles.sourceBox}>
                    <Text style={styles.sourceTitle}>Sources</Text>
                    {message.sources.slice(0, 4).map((source, sourceIndex) => (
                      <Text key={`${source.name || source.url}-${sourceIndex}`} style={styles.sourceText}>
                        {source.name || source.url}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {message.safetyNote ? (
                  <View style={styles.safetyBox}>
                    <Text style={styles.safetyText}>{message.safetyNote}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.chatInputRow}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              style={[styles.input, styles.chatInput]}
              placeholder="Type your message"
              placeholderTextColor="#9CA3AF"
            />
            <Pressable style={styles.sendButton} onPress={onSendChat} disabled={chatLoading}>
              <Text style={styles.sendButtonText}>{chatLoading ? '...' : 'Send'}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          For health risk awareness only. This is not a medical diagnosis.
        </Text>
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingText}>Loading diabetes helper...</Text>
      </View>
    );
  }

  return screenMode === 'form' ? renderHealthForm() : renderChatScreen();
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F8FB' },
  scrollContent: { padding: 18, paddingBottom: 42 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F6F8FB',
  },
  loadingText: { marginTop: 12, color: '#475569', fontSize: 17, fontWeight: '700' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    marginBottom: 18,
  },
  backButton: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EAF2FF',
    justifyContent: 'center',
    marginRight: 18,
  },
  backText: { color: '#2563EB', fontWeight: '900', fontSize: 18, lineHeight: 24 },
  headerTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: 30,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 36,
  },
  riskPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 18,
    marginBottom: 14,
  },
  welcomeText: { color: '#475569', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  riskLabel: { color: '#0F172A', fontSize: 17, fontWeight: '800', marginBottom: 10 },
  riskBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginBottom: 10,
  },
  riskBadgeText: { fontSize: 30, fontWeight: '900' },
  confidenceText: { color: '#475569', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  summaryText: { color: '#1E293B', fontSize: 17, lineHeight: 25 },
  primaryButton: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  disabledButton: { opacity: 0.65 },
  advicePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CCFBF1',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  adviceTitle: { color: '#115E59', fontSize: 18, fontWeight: '900', marginBottom: 10 },
  adviceChipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  adviceChip: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  adviceChipText: { color: '#0F766E', fontSize: 15, fontWeight: '900' },
  snapshotPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 21, fontWeight: '900', color: '#0F172A' },
  textButton: { color: '#2563EB', fontSize: 16, fontWeight: '900' },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricTile: {
    width: '48%',
    minHeight: 88,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  metricLabel: { color: '#64748B', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  metricValue: { color: '#0F172A', fontSize: 21, fontWeight: '900' },
  factorRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  factorChip: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 8,
    marginTop: 8,
  },
  factorText: { color: '#1D4ED8', fontSize: 14, fontWeight: '800' },
  chatPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
  },
  chatBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    minHeight: 210,
    padding: 10,
    backgroundColor: '#F8FAFC',
    marginTop: 12,
    marginBottom: 10,
  },
  chatBubble: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    maxWidth: '94%',
  },
  chatUser: { alignSelf: 'flex-end', backgroundColor: '#DBEAFE' },
  chatAssistant: { alignSelf: 'flex-start', backgroundColor: '#ECFDF5' },
  chatText: { color: '#0F172A', fontSize: 16, lineHeight: 22 },
  sourceBox: {
    marginTop: 10,
    backgroundColor: '#FFFFFF',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  sourceTitle: { color: '#047857', fontSize: 13, fontWeight: '900', marginBottom: 4 },
  sourceText: { color: '#065F46', fontSize: 13, fontWeight: '800', lineHeight: 18, marginTop: 2 },
  safetyBox: {
    marginTop: 8,
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 8,
    padding: 9,
  },
  safetyText: { color: '#1E3A8A', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center' },
  chatInput: { flex: 1, marginRight: 10, minHeight: 54 },
  sendButton: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    minHeight: 54,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  disclaimer: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 2,
  },
  formIntro: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  formIntroTitle: { color: '#1E3A8A', fontSize: 20, fontWeight: '900', marginBottom: 6 },
  formIntroText: { color: '#1E40AF', fontSize: 17, lineHeight: 24 },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  formSectionTitle: { color: '#0F172A', fontSize: 22, fontWeight: '900', marginBottom: 12 },
  inputWrap: { marginBottom: 14 },
  inputLabel: { color: '#334155', marginBottom: 8, fontWeight: '900', fontSize: 17 },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    minHeight: 58,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontSize: 17,
    minHeight: 54,
  },
  inputShellInput: {
    borderWidth: 0,
  },
  unitText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '800',
    paddingRight: 14,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    minHeight: 54,
    marginRight: 8,
    marginBottom: 8,
  },
  choiceButtonActive: {
    borderColor: '#0F766E',
    backgroundColor: '#ECFDF5',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  radioOuterActive: { borderColor: '#0F766E' },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F766E',
  },
  choiceText: { color: '#334155', fontWeight: '900', fontSize: 16 },
  choiceTextActive: { color: '#0F766E' },
});

export default DiabetesPredictionScreen;
