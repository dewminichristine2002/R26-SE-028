import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  previewReminiscenceTopic,
  saveReminiscenceTopic,
} from '../api/emotionalSupportApi';
import { ListenControl, VoiceAnswerControl, VoiceStatus } from '../components/VoiceControls';
import { Button, Card, InlineState, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import useEnglishVoice from '../voice/useEnglishVoice';
import { colors, radius, screenInsets, spacing, type } from '../theme';

const PHOTO_PROMPT = 'Would you like to tell me something you remember about this photo?';

/**
 * PHOTO-ASSISTED REMINISCENCE.
 *
 * Strict safety rules implemented here:
 * - The elder EXPLICITLY chooses one photo via the system picker. The app
 *   never scans the gallery and never uploads photos anywhere.
 * - NO facial recognition, NO person identification, NO relative labelling,
 *   NO age/health/emotion inference. The image is a visual memory cue only.
 * - The chosen photo URI is held in component state only. It is never sent
 *   to the backend and is cleared when leaving the screen. Nothing about the
 *   image itself is persisted.
 * - If the elder shares a memory AND explicitly taps "Yes, remember this",
 *   only safe topic metadata is stored (never the image).
 */
export default function PhotoMemoryScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [photoUri, setPhotoUri] = useState(null);
  const [memory, setMemory] = useState('');
  const [derivedTopic, setDerivedTopic] = useState(null);
  const [consentAsked, setConsentAsked] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');

  const handleTranscript = useCallback((transcript) => {
    setMemory(transcript);
    setVoiceTranscript(transcript);
  }, []);
  const voice = useEnglishVoice({ onTranscript: handleTranscript });

  // Storage policy: clear the local photo reference when leaving the screen.
  useEffect(() => () => {
    setPhotoUri(null);
    setMemory('');
  }, []);

  async function choosePhoto() {
    voice.stopAll();
    try {
      setError('');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        setError('Photo access is unavailable. You can still share a memory with words.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: false,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch {
      setError('We could not open your photos just now.');
    }
  }

  function removePhoto() {
    setPhotoUri(null);
  }

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
      await saveReminiscenceTopic({
        user_id: elderId,
        topic_type: derivedTopic.topic_type,
        topic_label: derivedTopic.topic_label,
        safe_detail: derivedTopic.safe_detail,
        source_activity_id: 'photo_reminiscence',
        consent: true,
      });
      setSavedMessage('Saved. We can gently revisit this topic in future memory activities. The photo itself was never saved.');
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

  return (
    <SafeAreaView style={s.safe}><WellnessBackdrop variant="warm" />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <ScreenHeader navigation={navigation} eyebrow="PHOTO REMINISCENCE" title="Remember Something Nice" subtitle="A photo you choose can help a memory come back." />

          {!savedMessage ? (
            <>
              {!photoUri ? (
                <Card style={s.chooseCard}>
                  <Text style={s.chooseTitle}>Remember with a Photo</Text>
                  <Text style={s.chooseHint}>You choose the photo yourself. It stays on your device.</Text>
                  <Button label="Choose a Photo" onPress={choosePhoto} style={s.chooseButton} />
                  {error ? <InlineState error /> : null}
                </Card>
              ) : (
                <>
                  <Card style={s.photoCard}>
                    <Image accessibilityLabel="Your chosen photo" source={{ uri: photoUri }} style={s.photo} resizeMode="cover" />
                    <Button variant="secondary" label="Remove photo" onPress={removePhoto} style={s.removeButton} />
                  </Card>
                  <Card style={s.promptCard}>
                    <Text style={s.promptText}>{PHOTO_PROMPT}</Text>
                    <ListenControl isSpeaking={voice.isSpeaking} onPress={() => voice.isSpeaking ? voice.stopSpeaking() : voice.speak(PHOTO_PROMPT)} />
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
                  </Card>
                  <View style={[s.actionsRow]}>
                    <VoiceAnswerControl compact audioState={voice.audioState} disabled={saving} onStart={voice.startListening} onStop={() => voice.stopListening()} />
                    <Button label="Continue" loading={saving} disabled={!memory.trim() || saving || voice.isListening} onPress={offerConsent} style={s.actionButton} />
                  </View>

                  {/* Explicit consent step — only topic metadata is ever saved */}
                  {consentAsked ? (
                    <Card style={s.consentCard}>
                      {derivedTopic ? (
                        <>
                          <Text style={s.consentTitle}>Would you like ElderMeds to remember this topic for future memory activities?</Text>
                          <Text style={s.consentDetail}>Only “{derivedTopic.topic_label || derivedTopic.topic_type}” would be saved — not the photo, not your full words.</Text>
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
                  {error ? <InlineState error /> : null}
                </>
              )}
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
  chooseCard: { alignItems: 'center', paddingVertical: spacing.xxl },
  chooseTitle: { ...type.section, color: colors.text },
  chooseHint: { ...type.meta, color: colors.secondary, marginTop: spacing.sm, textAlign: 'center' },
  chooseButton: { alignSelf: 'stretch', marginTop: spacing.lg },
  photoCard: { overflow: 'hidden' },
  photo: { borderRadius: radius.card, height: 260, width: '100%' },
  removeButton: { marginTop: spacing.md },
  promptCard: { marginTop: spacing.lg, backgroundColor: '#FFF0E6' },
  promptText: { ...type.question, color: colors.text },
  answerCard: { marginTop: spacing.lg },
  answerTitle: { ...type.card, color: colors.text },
  input: { ...type.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.text, marginTop: spacing.md, minHeight: 118, padding: spacing.lg, textAlignVertical: 'top' },
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
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