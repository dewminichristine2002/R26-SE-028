import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from 'react-native-datetimepicker/datetimepicker';
import {
  getReminiscencePrompt,
  previewReminiscenceTopic,
  saveReminiscenceTopic,
} from '../api/emotionalSupportApi';
import { ListenControl, VoiceAnswerControl, VoiceStatus } from '../components/VoiceControls';
import { Button, Card, InlineState, OrganicIcon, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import useEnglishVoice from '../voice/useEnglishVoice';
import { colors, radius, screenInsets, spacing, type } from '../theme';

/**
 * Free-form memory sharing with an explicit, non-manipulative consent step.
 *
 * Consent rules:
 * - The elder's words are NEVER stored as a reusable topic automatically.
 * - After sharing, a deterministic topic preview may be offered:
 *   "Would you like ElderMeds to remember this topic for future memory
 *   activities?" [Yes, remember this] [Not now]
 * - Only an explicit "Yes" stores safe topic metadata.
 */
export default function MemoryMomentScreen({ navigation, route }) {
  const { elderId } = useEmotionalSupportContext();
  const presetPrompt = route?.params?.prompt || null;
  const [prompt, setPrompt] = useState(presetPrompt);
  const [promptSource, setPromptSource] = useState(presetPrompt ? 'preset' : '');
  const [memory, setMemory] = useState('');
  const [loading, setLoading] = useState(!presetPrompt);
  const [error, setError] = useState('');
  const [derivedTopic, setDerivedTopic] = useState(null);
  const [consentAsked, setConsentAsked] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [memoryDate, setMemoryDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [category, setCategory] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const topicCategories = ['Hobby','Family','Work','Place','Music','Food','Travel','Pets','Other'];

  useEffect(() => () => { setPhotoUri(null); }, []);

  function onDateChange(event, selectedDate) {
    setShowDatePicker(false);
    if (selectedDate) setMemoryDate(selectedDate.toISOString().slice(0,10));
  }

  function openCategoryPicker() { setShowCategoryPicker(true); }
  function selectCategory(c) { setCategory(c); setShowCategoryPicker(false); }

  async function choosePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        setError('Photo access is unavailable. You can still share a memory with words.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) setPhotoUri(result.assets[0].uri);
    } catch {
      setError('We could not open your photos just now.');
    }
  }

  function removePhoto() {
    setPhotoUri(null);
  }

  const handleTranscript = useCallback((transcript) => {
    setMemory(transcript);
    setVoiceTranscript(transcript);
  }, []);
  const voice = useEnglishVoice({ onTranscript: handleTranscript });

  useEffect(() => {
    let mounted = true;
    if (presetPrompt) return undefined;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const result = await getReminiscencePrompt(elderId);
        if (!mounted) return;
        setPrompt(result.prompt);
        setPromptSource(result.source || 'generic');
      } catch {
        if (mounted) {
          setPrompt('Would you like to remember something pleasant from your past?');
          setPromptSource('generic');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [elderId, presetPrompt]);

  async function offerConsent() {
    if (!memory.trim() || !elderId) return;
    voice.stopAll();
    try {
      setSaving(true);
      setError('');
      const result = await previewReminiscenceTopic({ memory_text: memory.trim() });
      setDerivedTopic(result.derived_topic || null);
      setConsentAsked(true);
    } catch {
      setError('We could not prepare that just now.');
    } finally {
      setSaving(false);
    }
  }

  async function rememberTopic() {
    if (!derivedTopic) return;
    try {
      setSaving(true);
      setError('');
      // Compose safe_detail to include optional category and date (kept concise)
        const extra = [category || null, memoryDate || null].filter(Boolean).join(' | ');
        const safeDetail = [derivedTopic.safe_detail || null, extra || null].filter(Boolean).join(' | ').slice(0,120) || null;

        await saveReminiscenceTopic({
          user_id: elderId,
          topic_type: derivedTopic.topic_type,
          topic_label: derivedTopic.topic_label,
          safe_detail: safeDetail,
          consent: true,
        });
      setSavedMessage('Saved. We can gently revisit this topic in future memory activities.');
      setConsentAsked(false);
    } catch {
      setError('We could not save that right now.');
    } finally {
      setSaving(false);
    }
  }

  function declineRemember() {
    setConsentAsked(false);
    setDerivedTopic(null);
    setSavedMessage('Noted. Nothing has been saved.');
  }

  const spokenPrompt = prompt || 'Take your time.';

  return (
    <SafeAreaView style={s.safe}><WellnessBackdrop variant="warm" />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <ScreenHeader navigation={navigation} eyebrow="MEMORY MOMENT" title="Remember Something Nice" subtitle="Share as much or as little as feels comfortable." />

          {!savedMessage ? (
            <>
              <Card style={s.promptCard}>
                <View style={s.promptTop}>
                  <OrganicIcon color="#9A654C" soft="#FFFFFF88" label="MEM" />
                  <Text style={s.promptLabel}>{promptSource === 'remembered_topic' ? 'FROM YOUR REMEMBERED TOPICS' : "TODAY'S MEMORY PROMPT"}</Text>
                </View>
                {loading ? <ActivityIndicator color="#9A654C" style={{ marginTop: spacing.lg }} /> : (
                  <Text style={s.promptText}>{spokenPrompt}</Text>
                )}
                <ListenControl isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(spokenPrompt)} />
              </Card>

              <Card style={s.answerCard}>
                <Text style={s.answerTitle}>Tell me about it</Text>
                <TextInput
                  accessibilityLabel="Your memory"
                  style={s.input}
                  value={memory}
                  onChangeText={setMemory}
                  editable={!saving}
                  multiline
                  textAlignVertical="top"
                  placeholder="Type your memory..."
                  placeholderTextColor={colors.secondary}
                />
                <VoiceStatus audioState={voice.audioState} error={voice.voiceError} transcript={voiceTranscript} />

                <Text style={[s.helper, { marginTop: 12 }]}>Photo (optional)</Text>
                {!photoUri ? (
                  <View style={{ marginTop: 6 }}>
                    <Button label="Choose a Photo" onPress={choosePhoto} />
                  </View>
                ) : (
                  <View style={{ marginTop: 8 }}>
                    <Image source={{ uri: photoUri }} style={{ width: '100%', height: 160, borderRadius: 10 }} resizeMode="cover" />
                    <Button variant="secondary" label="Remove photo" onPress={removePhoto} style={{ marginTop: 8 }} />
                  </View>
                )}

                <Text style={[s.label, { marginTop: 12 }]}>Category (optional)</Text>
                <Pressable onPress={openCategoryPicker} style={{ paddingVertical: 8 }}>
                  <Text style={{ ...type.card }}>{category || 'Choose a category'}</Text>
                </Pressable>

                <Text style={[s.label, { marginTop: 12 }]}>Date (optional)</Text>
                <Pressable onPress={() => setShowDatePicker(true)} style={{ paddingVertical: 8 }}>
                  <Text style={{ ...type.card }}>{memoryDate || 'Choose a date'}</Text>
                </Pressable>

                {showDatePicker ? (
                  <DateTimePicker value={memoryDate ? new Date(memoryDate) : new Date()} mode="date" display="default" onChange={onDateChange} />
                ) : null}

                {showCategoryPicker ? (
                  <Modal transparent visible animationType="slide">
                    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}>
                      <View style={{ backgroundColor: '#FFF', padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                        {topicCategories.map((c) => (
                          <Pressable key={c} onPress={() => selectCategory(c)} style={{ paddingVertical: 12 }}>
                            <Text style={{ ...type.card }}>{c}</Text>
                          </Pressable>
                        ))}
                        <View style={{ marginTop: 8 }}>
                          <Button variant="secondary" label="Cancel" onPress={() => setShowCategoryPicker(false)} />
                        </View>
                      </View>
                    </View>
                  </Modal>
                ) : null}

              </Card>

              <View style={[s.actions, s.actionsRow]}>
                <VoiceAnswerControl compact audioState={voice.audioState} disabled={saving} onStart={voice.startListening} onStop={() => voice.stopListening()} />
                <Button label="Continue" loading={saving} disabled={!memory.trim() || saving || voice.isListening} onPress={offerConsent} style={s.actionButton} />
              </View>
              {error ? <InlineState error /> : null}

              {/* Explicit consent step — never automatic */}
              {consentAsked ? (
                <Card style={s.consentCard}>
                  {derivedTopic ? (
                    <>
                      <Text style={s.consentTitle}>Would you like ElderMeds to remember this topic for future memory activities?</Text>
                      <Text style={s.consentDetail}>Only “{derivedTopic.topic_label || derivedTopic.topic_type}” would be saved — not your full words.</Text>
                      <View style={s.consentActions}>
                        <Button label="Yes, remember this" loading={saving} onPress={rememberTopic} style={s.consentYes} />
                        <Button variant="secondary" label="Not now" onPress={declineRemember} style={s.consentNo} />
                      </View>
                    </>
                  ) : (
                    <Text style={s.consentTitle}>Thank you for sharing. There is no saved topic to remember from this moment.</Text>
                  )}
                </Card>
              ) : null}
            </>
          ) : (
            <Card style={s.doneCard}>
              <View style={s.check}><Text style={s.checkText}>OK</Text></View>
              <Text style={s.doneTitle}>Thank you for sharing.</Text>
              <Text style={s.doneCopy}>{savedMessage}</Text>
              <Button label="Done" onPress={() => navigation.popToTop()} style={s.fullButton} />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { backgroundColor: '#FFF9F3', flex: 1 },
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  promptCard: { backgroundColor: '#FFF0E6', overflow: 'hidden' },
  promptTop: { alignItems: 'center', flexDirection: 'row' },
  promptLabel: { ...type.meta, color: '#8A5D47', flex: 1, letterSpacing: 0.8, marginLeft: spacing.md },
  promptText: { ...type.question, color: colors.text, marginTop: spacing.xl },
  answerCard: { marginTop: spacing.lg },
  answerTitle: { ...type.card, color: colors.text },
  input: { ...type.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.text, marginTop: spacing.md, minHeight: 118, padding: spacing.lg, textAlignVertical: 'top' },
  actions: { marginTop: spacing.lg },
  actionsRow: { flexDirection: 'row', gap: spacing.md },
  actionButton: { flex: 1 },
  consentCard: { marginTop: spacing.lg, backgroundColor: '#FDF6E3' },
  consentTitle: { ...type.card, color: colors.text, fontSize: 18, lineHeight: 25 },
  consentDetail: { ...type.meta, color: colors.secondary, marginTop: spacing.sm },
  consentActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  consentYes: { flex: 1 },
  consentNo: { flex: 1 },
  doneCard: { alignItems: 'center', marginTop: spacing.md },
  check: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 38, height: 76, justifyContent: 'center', width: 76 },
  checkText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  doneTitle: { ...type.section, color: colors.text, marginTop: spacing.lg },
  doneCopy: { ...type.body, color: colors.secondary, marginTop: spacing.sm, textAlign: 'center' },
  fullButton: { alignSelf: 'stretch', marginTop: spacing.xl },
});