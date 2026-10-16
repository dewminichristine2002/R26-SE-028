import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  createMemoryEntry,
  createMemoryEntryWithPhoto,
  createMemoryPhotoRequestId,
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
 *   never scans the gallery. Upload requires a separate explicit save choice.
 * - NO facial recognition, NO person identification, NO relative labelling,
 *   NO age/health/emotion inference. The image is a visual memory cue only.
 * - The chosen photo URI is held in component state. It is only sent to the
 *   backend after the user explicitly chooses to save the photo with a story.
 * - If the elder shares a memory AND explicitly taps "Yes, remember this",
 *   only safe topic metadata is stored (never the image).
 */
export default function PhotoMemoryScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [photoUri, setPhotoUri] = useState(null);
  const [photoAsset, setPhotoAsset] = useState(null);
  const [photoSaveFailed, setPhotoSaveFailed] = useState(false);
  const photoRequestId = useRef(createMemoryPhotoRequestId());
  const [memory, setMemory] = useState('');
  const [title, setTitle] = useState('');
  const [derivedTopic, setDerivedTopic] = useState(null);
  const [consentAsked, setConsentAsked] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [storySaved, setStorySaved] = useState(false);
  const [storyPhotoSaved, setStoryPhotoSaved] = useState(false);
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
      setPhotoAsset(null);
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
        setPhotoAsset(result.assets[0]);
        photoRequestId.current = createMemoryPhotoRequestId();
        setPhotoSaveFailed(false);
      }
    } catch {
      setError('We could not open your photos just now.');
    }
  }

  function removePhoto() {
    setPhotoUri(null);
    setPhotoAsset(null);
    setPhotoSaveFailed(false);
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
      setSavedMessage('Saved. We can gently revisit this topic in future memory activities.');
      setConsentAsked(false);
    } catch {
      setError('We could not save that right now.');
    } finally {
      setSaving(false);
    }
  }

  async function saveStory(savePhoto = Boolean(photoAsset)) {
    if (!memory.trim() || !elderId) return;
    try {
      setSaving(true);
      setError('');
      const payload = {
        user_id: elderId,
        entry_type: 'life_book',
        title: title.trim() || 'Photo memory',
        category: 'Photo memory',
        story: memory.trim(),
        memory_date: null,
        consent: true,
      };
      if (savePhoto && photoAsset) await createMemoryEntryWithPhoto(payload, photoAsset, photoRequestId.current);
      else await createMemoryEntry(payload);
      setStorySaved(true);
      setStoryPhotoSaved(Boolean(savePhoto && photoAsset));
      setPhotoSaveFailed(false);
    } catch {
      setPhotoSaveFailed(Boolean(savePhoto && photoAsset));
      setError(savePhoto && photoAsset ? 'The photo was not saved. Retry the photo or save the story without it.' : 'We could not save that story just now. Your selected photo and words are still on this screen.');
    } finally {
      setSaving(false);
    }
  }

  function declineRemember() {
    setConsentAsked(false);
    setDerivedTopic(null);
    setSavedMessage(storySaved ? 'No additional topic was saved. Your written story remains in My Life Book.' : 'Noted. Nothing has been saved.');
  }

  return (
    <SafeAreaView style={s.safe}><WellnessBackdrop variant="warm" />
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <ScreenHeader navigation={navigation} eyebrow="MY PHOTO MEMORIES" title="A photo can bring a story to mind" subtitle="Choose one photo, then share as much or as little as feels comfortable." />

          {!savedMessage ? (
            <>
              {!photoUri ? (
                <Card style={s.chooseCard}>
                  <View style={s.photoPlaceholder}><Text accessibilityElementsHidden style={s.photoPlaceholderGlyph}>▧</Text><Text style={s.photoPlaceholderTitle}>Add a photo cue</Text><Text style={s.chooseHint}>Select one picture from your device. You can save it privately with your story, or keep only the words.</Text><Button label="Choose a Photo" onPress={choosePhoto} style={s.chooseButton} /></View>
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
                    <TextInput accessibilityLabel="Memory title" style={[s.input, s.titleInput]} value={title} onChangeText={setTitle} editable={!saving} placeholder="Story title (optional)" placeholderTextColor={colors.secondary} />
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
                    <View style={s.privacyNote}><Text style={s.privacyMark}>i</Text><Text style={s.storageNote}>Your words are saved to My Life Book. The selected photo is uploaded only after you choose Save Photo Privately; otherwise it stays on this device.</Text></View>
                    <VoiceStatus audioState={voice.audioState} error={voice.voiceError} transcript={voiceTranscript} />
                  </Card>
                  <View style={[s.actionsRow]}>
                    <VoiceAnswerControl compact audioState={voice.audioState} disabled={saving} onStart={voice.startListening} onStop={() => voice.stopListening()} />
                    <Button label="Continue" loading={saving} disabled={!memory.trim() || saving || voice.isListening} onPress={offerConsent} style={s.actionButton} />
                  </View>
                  <Button label={photoAsset ? 'Save Photo Privately' : 'Save story to My Life Book'} loading={saving} disabled={!memory.trim() || saving || voice.isListening || storySaved} onPress={() => photoAsset ? Alert.alert('Save this photo privately?', 'The photo will be stored with this story in your account and shown only to you when revisiting it.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Save story only', onPress: () => saveStory(false) },
                    { text: 'Save photo and story', onPress: () => saveStory(true) },
                  ]) : saveStory(false)} style={s.saveStoryButton} />
                  {photoAsset && !storySaved ? <Button variant="secondary" label="Save Text Only" loading={saving} disabled={!memory.trim() || saving || voice.isListening} onPress={() => saveStory(false)} style={s.textOnlyButton} /> : null}
                  {photoSaveFailed ? <View style={s.saveStoryButton}>
                    <Button variant="secondary" label="Retry photo save" onPress={() => saveStory(true)} loading={saving} />
                    <Button variant="secondary" label="Save story only" onPress={() => saveStory(false)} loading={saving} style={{ marginTop: spacing.xs }} />
                  </View> : null}
                  {storySaved ? <Text accessibilityLiveRegion="polite" style={s.savedNotice}>Your story was saved to My Life Book{storyPhotoSaved ? ' with its photo.' : '.'}</Text> : null}

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
              {storySaved ? <Button label="Open My Life Book" onPress={() => navigation.navigate('MyLifeBook')} style={s.fullButton} /> : null}
              <Button label="Done" onPress={() => navigation.popToTop()} style={s.fullButton} />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  chooseCard: { alignItems: 'center', paddingVertical: spacing.xxl },
  photoPlaceholder: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: '#F4EEF7', borderColor: '#E2D8E9', borderRadius: radius.card, borderStyle: 'dashed', borderWidth: 1.5, padding: spacing.xl },
  photoPlaceholderGlyph: { color: '#765692', fontSize: 42, fontWeight: '800' },
  photoPlaceholderTitle: { ...type.card, color: colors.text, marginTop: spacing.sm, textAlign: 'center' },
  chooseHint: { ...type.meta, color: colors.secondary, marginTop: spacing.sm, textAlign: 'center' },
  chooseButton: { alignSelf: 'stretch', marginTop: spacing.lg },
  photoCard: { overflow: 'hidden' },
  photo: { borderRadius: radius.card, height: 260, width: '100%' },
  removeButton: { marginTop: spacing.md },
  promptCard: { marginTop: spacing.lg, backgroundColor: '#F8F1E8', borderColor: '#E8DCCB' },
  promptText: { ...type.question, color: colors.text },
  answerCard: { marginTop: spacing.lg },
  answerTitle: { ...type.card, color: colors.text },
  input: { ...type.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.text, marginTop: spacing.md, minHeight: 118, padding: spacing.lg, textAlignVertical: 'top' },
  titleInput: { minHeight: 52, textAlignVertical: 'center' },
  storageNote: { ...type.meta, color: colors.secondary, flex: 1 },
  privacyNote: { alignItems: 'flex-start', backgroundColor: '#F4F7F1', borderRadius: 16, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  privacyMark: { alignItems: 'center', backgroundColor: '#E3F0E8', borderRadius: 14, color: colors.primary, fontSize: 17, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  actionButton: { flex: 1 },
  saveStoryButton: { alignSelf: 'stretch', marginTop: spacing.md },
  textOnlyButton: { alignSelf: 'stretch', marginTop: spacing.sm },
  savedNotice: { ...type.meta, color: colors.primary, fontWeight: '800', marginTop: spacing.sm },
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
  doneCopy: { ...type.body, color: colors.primary, marginTop: spacing.sm, textAlign: 'center' },
  fullButton: { alignSelf: 'stretch', marginTop: spacing.xl },
});
