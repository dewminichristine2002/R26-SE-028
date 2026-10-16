import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, ScreenHeader, InlineState, WellnessBackdrop } from '../components/WellnessUI';
import { colors, radius, screenInsets, spacing, type } from '../theme';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { createMemoryEntry, createMemoryEntryWithPhoto, createMemoryPhotoRequestId, listMemoryEntries, deleteMemoryEntry } from '../api/emotionalSupportApi';
import PrivateMemoryPhoto from '../components/PrivateMemoryPhoto';

const GOOD_DEEDS_CATEGORY = 'Good Deeds & Achievements';
const SUGGESTED_CATEGORIES = [
  'Childhood Memories', 'Family & Friends', 'Special Occasions', 'Favorite Places',
  'Hobbies & Interests', GOOD_DEEDS_CATEGORY,
];

const isGoodDeedEntry = (entry) => entry?.entryType === 'good_deed';
const matchesCategory = (entry, selected) => {
  if (!selected || selected === 'All memories') return true;
  if (selected === GOOD_DEEDS_CATEGORY) return isGoodDeedEntry(entry) || entry.category === GOOD_DEEDS_CATEGORY;
  if (selected === 'No category') return !entry.category;
  return entry.category === selected;
};

export default function MyLifeBookScreen({ navigation, route }) {
  const { elderId } = useEmotionalSupportContext();
  const [entries, setEntries] = useState([]);
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [photoAsset, setPhotoAsset] = useState(null);
  const [photoSaveFailed, setPhotoSaveFailed] = useState(false);
  const photoRequestId = useRef(createMemoryPhotoRequestId());
  const [memoryDate, setMemoryDate] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activeFilter, setActiveFilter] = useState(route?.name === 'GoodDeeds' ? GOOD_DEEDS_CATEGORY : 'All memories');
  const legacyGoodDeedsRoute = route?.name === 'GoodDeeds';

  const load = useCallback(async () => {
    if (!elderId) { setEntries([]); setEntriesLoading(false); return; }
    try {
      setEntriesLoading(true);
      setEntriesError(false);
      // Load both entry types so historical Good Deeds remain in the unified book.
      const response = await listMemoryEntries(elderId);
      setEntries((response?.entries || []).filter((entry) => ['life_book', 'good_deed'].includes(entry.entryType)));
    } catch {
      setEntriesError(true);
    } finally {
      setEntriesLoading(false);
    }
  }, [elderId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (route?.name === 'GoodDeeds') {
      setActiveFilter(GOOD_DEEDS_CATEGORY);
      setCategory(GOOD_DEEDS_CATEGORY);
      setShowForm(true);
    } else if (route?.name === 'MyLifeBook' || route?.name === 'PhotoMemoryScreen') {
      setActiveFilter('All memories');
      setCategory('');
      setShowForm(false);
    }
  }, [route?.name]);

  const filterOptions = useMemo(() => {
    const existing = entries.map((entry) => entry.category).filter(Boolean);
    const categories = [...new Set([...SUGGESTED_CATEGORIES, ...existing])]
      .filter((item) => item !== GOOD_DEEDS_CATEGORY);
    return ['All memories', GOOD_DEEDS_CATEGORY, 'No category', ...categories];
  }, [entries]);
  const visibleEntries = useMemo(() => entries.filter((entry) => matchesCategory(entry, activeFilter)), [entries, activeFilter]);

  async function choosePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        setError('Photo access is unavailable. You can still save a text-only memory.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: false, allowsEditing: false, quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
        setPhotoAsset(result.assets[0]);
        photoRequestId.current = createMemoryPhotoRequestId();
        setPhotoSaveFailed(false);
      }
    } catch {
      setError('Could not open photos right now. You can still save a text-only memory.');
    }
  }

  function removePhoto() {
    setPhotoUri(null);
    setPhotoAsset(null);
    setPhotoSaveFailed(false);
  }

  function selectCategory(value) {
    setShowCategoryPicker(false);
    setCustomCategory(value === 'Other / My Own Category');
    setCategory(['No category', 'Other / My Own Category'].includes(value) ? '' : value);
  }

  async function confirmDelete(entryId) {
    Alert.alert('Delete this memory?', 'This will remove the entry from your Life Book.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteMemoryEntry(entryId, elderId);
          setEntries((current) => current.filter((entry) => entry.id !== entryId));
        } catch {
          setError('Could not delete this memory right now.');
        }
      } },
    ]);
  }

  async function onSave(savePhoto = Boolean(photoAsset)) {
    setError('');
    if (!title.trim()) { setError('Please enter a title for this memory.'); return; }
    if (!story.trim()) { setError('Please add a few words to the story.'); return; }
    if (customCategory && category.trim().length > 80) { setError('A category can be up to 80 characters.'); return; }
    setSaving(true);
    try {
      const payload = {
        user_id: elderId,
        // Keep the legacy Good Deeds type intact when its old route is opened.
        entry_type: legacyGoodDeedsRoute ? 'good_deed' : 'life_book',
        title: title.trim(),
        category: category.trim() || null,
        story: story.trim(),
        memory_date: memoryDate.trim() || null,
        consent: true,
      };
      if (savePhoto && photoAsset) await createMemoryEntryWithPhoto(payload, photoAsset, photoRequestId.current);
      else await createMemoryEntry(payload);
      setTitle(''); setStory(''); setPhotoUri(null); setPhotoAsset(null); setPhotoSaveFailed(false);
      photoRequestId.current = createMemoryPhotoRequestId();
      setMemoryDate(''); setCategory(''); setCustomCategory(false); setShowForm(false);
      await load();
    } catch {
      setPhotoSaveFailed(Boolean(savePhoto && photoAsset));
      setError(savePhoto && photoAsset
        ? 'The photo was not saved. Retry the private photo save or save this memory as text only.'
        : 'Could not save this memory right now. Your title and story are still here.');
    } finally {
      setSaving(false);
    }
  }

  return <SafeAreaView style={s.safe}>
    <WellnessBackdrop variant="warm" />
    <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader navigation={navigation} eyebrow="YOUR PERSONAL JOURNAL" title="My Life Book" subtitle="Keep photos, stories, and proud moments together." />

      <Card style={s.introCard}>
        <Text style={s.introEyebrow}>A MEMORY COLLECTION THAT IS YOURS</Text>
        <Text style={s.introText}>Add a photo with your story, save words on their own, or choose a category to help you find a memory later.</Text>
      </Card>

      <Button label={showForm ? 'Close Add Memory' : 'Add Memory'} onPress={() => { setError(''); setShowForm((current) => !current); }} style={s.addButton} />

      {showForm ? <Card style={s.formCard}>
        <Text style={s.formHeading}>Add a memory</Text>
        <Text style={s.formHint}>A photo is optional. Nothing is uploaded unless you choose to save it privately.</Text>
        <Text style={s.label}>Title</Text>
        <TextInput accessibilityLabel="Memory title" value={title} onChangeText={setTitle} editable={!saving} maxLength={200} placeholder="Give this memory a title" style={s.input} />
        <Text style={s.label}>Story</Text>
        <TextInput accessibilityLabel="Memory story" value={story} onChangeText={setStory} editable={!saving} multiline textAlignVertical="top" placeholder="Write a few words, or as much as you like" style={[s.input, s.storyInput]} />

        <Text style={s.label}>Photo (optional)</Text>
        {!photoUri ? <Button variant="secondary" label="Choose a Photo" onPress={choosePhoto} style={s.photoButton} /> : <View style={s.photoPreviewWrap}>
          <Image accessibilityLabel="Selected photo preview" source={{ uri: photoUri }} style={s.photoPreview} resizeMode="cover" />
          <Button variant="secondary" label="Remove photo" onPress={removePhoto} style={s.removePhotoButton} />
        </View>}
        <Text style={s.privacyNote}>Selected photos stay on this device until you choose “Save Photo Privately.” If that upload fails, the memory is not silently saved without its photo.</Text>

        <Text style={s.label}>Memory date (optional)</Text>
        <TextInput accessibilityLabel="Memory date" style={s.input} value={memoryDate} onChangeText={setMemoryDate} editable={!saving} placeholder="YYYY-MM-DD" placeholderTextColor={colors.secondary} />

        <Text style={s.label}>Category (optional)</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Choose memory category. Current: ${category || 'No category'}`} onPress={() => setShowCategoryPicker(true)} style={s.selectButton}>
          <Text style={s.selectText}>{category || 'No category'}</Text><Text style={s.selectArrow}>Choose</Text>
        </Pressable>
        {customCategory ? <TextInput accessibilityLabel="Custom memory category" value={category} onChangeText={setCategory} editable={!saving} maxLength={80} placeholder="Enter a category (up to 80 characters)" style={s.input} /> : null}

        {error ? <InlineState error /> : null}
        {photoAsset ? <View style={s.saveActions}>
          <Button label="Save Photo Privately" loading={saving} disabled={!title.trim() || !story.trim() || saving} onPress={() => Alert.alert('Save this photo privately?', 'The photo will be stored in your private account with this story. Only you can view it.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Save Photo Privately', onPress: () => onSave(true) },
          ])} />
          <Button variant="secondary" label="Save Text Only" loading={saving} disabled={!title.trim() || !story.trim() || saving} onPress={() => onSave(false)} style={s.secondarySave} />
        </View> : <Button label="Save Text Only" loading={saving} disabled={!title.trim() || !story.trim() || saving} onPress={() => onSave(false)} style={s.saveButton} />}
        {photoSaveFailed ? <Button variant="secondary" label="Retry photo save" onPress={() => onSave(true)} loading={saving} style={s.retryButton} /> : null}
      </Card> : null}

      <View style={s.filterHeader}>
        <Text style={s.listTitle}>Saved memories</Text>
        <Pressable accessibilityRole="button" onPress={() => setShowFilterPicker(true)} style={s.filterButton}>
          <Text style={s.filterLabel}>Filter</Text><Text style={s.filterValue}>{activeFilter}</Text>
        </Pressable>
      </View>
      <InlineState loading={entriesLoading} error={entriesError} onRetry={load} empty={!entriesLoading && !entriesError && entries.length === 0} emptyTitle="Your Life Book is ready" emptyText="Add a photo memory or a text-only story whenever you wish." />
      {!entriesLoading && !entriesError && entries.length > 0 && visibleEntries.length === 0 ? <InlineState empty emptyTitle="No memories in this category" emptyText="Choose another category or add a memory to this one." /> : null}
      {!entriesLoading && !entriesError && visibleEntries.map((entry) => <Card key={entry.id} style={[s.entryCard, isGoodDeedEntry(entry) && s.goodDeedCard]}>
        {entry.photoUrl || entry.photoUnavailable ? <PrivateMemoryPhoto entryId={entry.id} userId={elderId} photoUrl={entry.photoUrl} style={s.entryPhoto} /> : null}
        <Text style={s.entryType}>{isGoodDeedEntry(entry) ? 'GOOD DEED OR PROUD MOMENT' : entry.photoSaved ? 'PHOTO MEMORY' : 'LIFE BOOK STORY'}</Text>
        <Text accessibilityRole="header" style={s.entryTitle}>{entry.title}</Text>
        {entry.category ? <Text style={s.entryMeta}>{entry.category}</Text> : <Text style={s.entryMeta}>No category</Text>}
        {entry.memoryDate ? <Text style={s.entryMeta}>{entry.memoryDate}</Text> : null}
        {entry.story ? <Text style={s.story}>{entry.story}</Text> : <Text style={s.storyMissing}>No written story was saved with this title.</Text>}
        <View style={s.entryActions}>
          <Button label="Revisit this memory" onPress={() => navigation.navigate('MemoryConversationScreen', { entryId: entry.id })} style={s.entryAction} />
          <Button variant="secondary" label="Delete" onPress={() => confirmDelete(entry.id)} style={s.entryAction} />
        </View>
      </Card>)}

      <Modal transparent visible={showCategoryPicker} animationType="slide" onRequestClose={() => setShowCategoryPicker(false)}>
        <View style={s.modalScrim}><View style={s.modalCard}>
          <Text style={s.modalTitle}>Choose a category</Text>
          {['No category', ...SUGGESTED_CATEGORIES, 'Other / My Own Category'].map((item) => <Pressable key={item} accessibilityRole="button" onPress={() => selectCategory(item)} style={s.modalOption}><Text style={s.modalOptionText}>{item}</Text></Pressable>)}
          <Button variant="secondary" label="Cancel" onPress={() => setShowCategoryPicker(false)} style={s.modalCancel} />
        </View></View>
      </Modal>

      <Modal transparent visible={showFilterPicker} animationType="slide" onRequestClose={() => setShowFilterPicker(false)}>
        <View style={s.modalScrim}><View style={s.modalCard}>
          <Text style={s.modalTitle}>Show memories</Text>
          {filterOptions.map((item) => <Pressable key={item} accessibilityRole="button" onPress={() => { setActiveFilter(item); setShowFilterPicker(false); }} style={s.modalOption}><Text style={s.modalOptionText}>{item}</Text></Pressable>)}
          <Button variant="secondary" label="Cancel" onPress={() => setShowFilterPicker(false)} style={s.modalCancel} />
        </View></View>
      </Modal>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  introCard: { backgroundColor: '#FFF9F5', borderColor: '#EAD9D5', marginBottom: spacing.md },
  introEyebrow: { ...type.meta, color: '#98566C', fontWeight: '900', letterSpacing: 0.7 },
  introText: { ...type.body, color: colors.text, marginTop: spacing.xs },
  addButton: { marginBottom: spacing.md },
  formCard: { borderTopColor: colors.primary, borderTopWidth: 4 },
  formHeading: { ...type.card, color: colors.text },
  formHint: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  label: { ...type.meta, color: colors.secondary, fontWeight: '800', marginTop: spacing.md },
  input: { ...type.body, backgroundColor: '#FBF8F3', borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, color: colors.text, marginTop: spacing.xs, minHeight: 52, padding: spacing.md },
  storyInput: { minHeight: 118, textAlignVertical: 'top' },
  photoButton: { marginTop: spacing.xs },
  photoPreviewWrap: { marginTop: spacing.xs },
  photoPreview: { borderRadius: radius.card, height: 180, width: '100%' },
  removePhotoButton: { marginTop: spacing.sm },
  privacyNote: { ...type.meta, backgroundColor: '#F4F7F1', borderRadius: radius.button, color: colors.secondary, marginTop: spacing.sm, padding: spacing.md },
  selectButton: { alignItems: 'center', backgroundColor: '#FBF8F3', borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs, minHeight: 52, paddingHorizontal: spacing.md },
  selectText: { ...type.body, color: colors.text, flex: 1 },
  selectArrow: { ...type.meta, color: colors.primary, fontWeight: '900', marginLeft: spacing.sm },
  saveActions: { marginTop: spacing.lg },
  saveButton: { marginTop: spacing.lg },
  secondarySave: { marginTop: spacing.sm },
  retryButton: { marginTop: spacing.sm },
  filterHeader: { marginTop: spacing.xl },
  listTitle: { ...type.section, color: colors.text, marginBottom: spacing.sm },
  filterButton: { alignItems: 'center', backgroundColor: '#FFF', borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md },
  filterLabel: { ...type.meta, color: colors.secondary, fontWeight: '800' },
  filterValue: { ...type.meta, color: colors.primary, flexShrink: 1, fontWeight: '900', marginLeft: spacing.sm, textAlign: 'right' },
  entryCard: { marginTop: spacing.sm, overflow: 'hidden' },
  goodDeedCard: { borderLeftColor: '#A65D25', borderLeftWidth: 4 },
  entryPhoto: { borderRadius: radius.button, height: 180, marginBottom: spacing.md, width: '100%' },
  entryType: { ...type.meta, color: '#765692', fontWeight: '900', letterSpacing: 0.5 },
  entryTitle: { ...type.card, color: colors.text, marginTop: spacing.xs },
  entryMeta: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  story: { ...type.body, color: colors.text, marginTop: spacing.md },
  storyMissing: { ...type.meta, color: colors.secondary, fontStyle: 'italic', marginTop: spacing.md },
  entryActions: { gap: spacing.sm, marginTop: spacing.md },
  entryAction: { alignSelf: 'stretch' },
  modalScrim: { backgroundColor: '#00000066', flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, maxHeight: '82%', padding: spacing.lg },
  modalTitle: { ...type.section, color: colors.text, marginBottom: spacing.sm },
  modalOption: { borderBottomColor: colors.border, borderBottomWidth: 1, justifyContent: 'center', minHeight: 54, paddingVertical: spacing.sm },
  modalOptionText: { ...type.body, color: colors.text },
  modalCancel: { marginTop: spacing.md },
});
