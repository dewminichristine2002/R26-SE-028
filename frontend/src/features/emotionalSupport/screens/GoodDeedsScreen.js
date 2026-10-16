import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, ScreenHeader, InlineState, WellnessBackdrop } from '../components/WellnessUI';
import { colors, radius, spacing, type } from '../theme';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { createMemoryEntry, createMemoryEntryWithPhoto, createMemoryPhotoRequestId, listMemoryEntries, deleteMemoryEntry } from '../api/emotionalSupportApi';
import PrivateMemoryPhoto from '../components/PrivateMemoryPhoto';

export default function GoodDeedsScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [entries, setEntries] = useState([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [photoAsset, setPhotoAsset] = useState(null);
  const [photoSaveFailed, setPhotoSaveFailed] = useState(false);
  const photoRequestId = useRef(createMemoryPhotoRequestId());
  const [memoryDate, setMemoryDate] = useState(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const goodCategories = [
    'Helping Someone','Giving or Sharing','Family Support','Community Activity','Religious or Spiritual Activity','Visiting a Meaningful Place','Personal Achievement','Something I Am Grateful For','Other'
  ];


  const load = useCallback(async () => {
    if (!elderId) { setEntries([]); setEntriesLoading(false); return; }
    try {
      setEntriesLoading(true);
      setEntriesError(false);
      const res = await listMemoryEntries(elderId, 'good_deed');
      setEntries(res?.entries || []);
    } catch {
      setEntriesError(true);
    } finally {
      setEntriesLoading(false);
    }
  }, [elderId]);
  useEffect(() => { load(); }, [load]);

  async function choosePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        setError('Photo access is unavailable. You can still save without a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
        setPhotoAsset(result.assets[0]);
        photoRequestId.current = createMemoryPhotoRequestId();
        setPhotoSaveFailed(false);
      }
    } catch {
      setError('Could not open photos right now.');
    }
  }

  function removePhoto() {
    setPhotoUri(null);
    setPhotoAsset(null);
    setPhotoSaveFailed(false);
  }


  function openCategoryPicker() {
    setShowCategoryPicker(true);
  }

  function selectCategory(c) {
    setCategory(c);
    setShowCategoryPicker(false);
  }

  async function confirmDelete(entryId) {
    Alert.alert('Delete entry?', 'This will remove the entry from your Good Deeds list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteMemoryEntry(entryId, elderId);
          setEntries((cur) => cur.filter((e) => e.id !== entryId));
        } catch {
          setError('Could not delete entry.');
        }
      } },
    ]);
  }

  async function onSave(savePhoto = Boolean(photoAsset)) {
    setError('');
    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    setSaving(true);
    try {
      const payload = { user_id: elderId, entry_type: 'good_deed', title: title.trim(), category: category.trim() || null, story: note.trim() || null, memory_date: memoryDate || null, consent: true };
      if (savePhoto && photoAsset) await createMemoryEntryWithPhoto(payload, photoAsset, photoRequestId.current);
      else await createMemoryEntry(payload);
      setTitle('');
      setCategory('');
      setNote('');
      setPhotoUri(null);
      setPhotoAsset(null);
      setPhotoSaveFailed(false);
      photoRequestId.current = createMemoryPhotoRequestId();
      setMemoryDate(null);
      await load();
    } catch (e) {
      setPhotoSaveFailed(Boolean(savePhoto && photoAsset));
      setError(savePhoto && photoAsset ? 'The photo was not saved. Retry the photo or save this entry without it.' : 'Could not save the entry right now.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}><WellnessBackdrop variant="warm" />
      <ScrollView contentContainerStyle={s.container}>
        <ScreenHeader navigation={navigation} eyebrow="MY GOOD DEEDS / PIN POTHA" title="Keep meaningful moments with a date and short note" />

        <Card style={s.introCard}><View style={s.introRow}><View style={s.proudMark}><Text style={s.proudMarkText}>✦</Text></View><View style={s.introCopy}><Text style={s.introEyebrow}>A MOMENT YOU VALUE</Text><Text style={s.introText}>Kindness, effort, and small wins all belong here.</Text></View></View></Card>

        <Card style={s.formCard}>
          <Text style={s.formHeading}>Save a proud moment</Text>
          <Text style={s.formHint}>There is no right size for a meaningful moment.</Text>
          <Text style={s.label}>Title</Text>
          <TextInput accessibilityLabel="Good deed title" value={title} onChangeText={setTitle} placeholder="Short title" style={s.input} />
          <Text style={s.label}>Category (optional)</Text>
          <Pressable onPress={openCategoryPicker} style={{ paddingVertical: 8 }}>
            <Text style={{ ...type.card }}>{category || 'Choose a category'}</Text>
          </Pressable>

          <Text style={s.label}>Short note</Text>
          <TextInput accessibilityLabel="Good deed note" value={note} onChangeText={setNote} placeholder="Write a short note..." style={[s.input, { minHeight: 100 }]} multiline textAlignVertical="top" />

          <Text style={[s.label, { marginTop: spacing.md }]}>Photo cue (optional)</Text>
          <Text style={s.photoNote}>Photos are optional. If you choose “Save photo,” the selected picture is stored privately with this memory so you can revisit it later.</Text>
          {!photoUri ? (
            <View style={{ marginTop: 6 }}>
              <Button label="Choose a Photo" onPress={choosePhoto} />
            </View>
          ) : (
            <View style={{ marginTop: 8 }}>
              <Image source={{ uri: photoUri }} style={{ width: '100%', height: 140, borderRadius: 10 }} resizeMode="cover" />
              <Button variant="secondary" label="Remove photo" onPress={removePhoto} style={{ marginTop: 8 }} />
            </View>
          )}

          <Text style={[s.label, { marginTop: spacing.md }]}>Date (optional)</Text>
          <TextInput
            accessibilityLabel="Memory date"
            style={[s.input, { minHeight: 40 }]}
            value={memoryDate || ''}
            onChangeText={setMemoryDate}
            editable={!saving}
            placeholder="Choose a date"
            placeholderTextColor={colors.secondary}
          />
          <Text style={{ ...type.card, marginTop: 6 }}>{memoryDate || 'Choose a date'}</Text>

          {showCategoryPicker ? (
            <Modal transparent visible animationType="slide">
              <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}>
                <View style={{ backgroundColor: '#FFF', padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                  {goodCategories.map((c) => (
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

          {error ? <InlineState error /> : null}
          <View style={{ marginTop: spacing.md }}>
          <Button label={photoAsset ? 'Save Entry and Photo' : 'Save Entry'} onPress={() => photoAsset ? Alert.alert('Save this photo privately?', 'The photo will be stored with this memory in your account and can be shown when you revisit it.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Save text only', onPress: () => onSave(false) },
            { text: 'Save photo and entry', onPress: () => onSave(true) },
          ]) : onSave(false)} loading={saving} />
          {photoSaveFailed ? <View style={{ marginTop: spacing.sm }}>
            <Button variant="secondary" label="Retry photo save" onPress={() => onSave(true)} loading={saving} />
            <Button variant="secondary" label="Save text only" onPress={() => onSave(false)} loading={saving} style={{ marginTop: spacing.xs }} />
          </View> : null}
          </View>
        </Card>

        <Text style={s.listTitle}>Existing entries</Text>
        <InlineState loading={entriesLoading} error={entriesError} onRetry={load} empty={!entriesLoading && !entriesError && !entries.length} emptyTitle="No moments saved yet" emptyText="Meaningful moments you save will appear here." />
        {!entriesLoading && !entriesError && entries.map((e) => (
          <Card key={e.id} style={[s.entryCard, { marginTop: spacing.sm }]}>
            {e.photoUrl || e.photoUnavailable ? <PrivateMemoryPhoto entryId={e.id} userId={elderId} photoUrl={e.photoUrl} style={{ borderRadius: 12, height: 150, marginBottom: spacing.sm, width: '100%' }} /> : null}
            <Text style={s.entryTitle}>{e.title}</Text>
            {e.category ? <Text style={s.entryMeta}>{e.category}</Text> : null}
            {e.story ? <Text style={s.story}>{e.story}</Text> : null}
            <View style={{ marginTop: spacing.sm }}>
              <Button variant="secondary" label="Delete" onPress={() => confirmDelete(e.id)} />
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  container: { padding: spacing.xl, paddingBottom: spacing.xxl },
  introCard: { backgroundColor: '#FFF4EF', borderColor: '#EFDDD2', marginBottom: spacing.md, padding: spacing.lg },
  introRow: { alignItems: 'center', flexDirection: 'row' },
  proudMark: { alignItems: 'center', backgroundColor: '#F5E4D6', borderRadius: 18, height: 54, justifyContent: 'center', width: 54 },
  proudMarkText: { color: '#A65D25', fontSize: 26, fontWeight: '900' },
  introCopy: { flex: 1, marginLeft: spacing.md },
  introEyebrow: { ...type.meta, color: '#98566C', letterSpacing: 0.8 },
  introText: { ...type.body, color: colors.text, marginTop: 2 },
  formCard: { borderTopColor: '#A65D25', borderTopWidth: 4 },
  formHeading: { ...type.card, color: colors.text },
  formHint: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  label: { ...type.meta, color: colors.secondary, marginTop: spacing.md },
  input: { ...type.body, borderColor: colors.border, borderWidth: 1, borderRadius: radius.button, padding: spacing.md, marginTop: spacing.xs, backgroundColor: '#FBF8F3', color: colors.text, minHeight: 52 },
  listTitle: { ...type.section, color: colors.text, marginTop: spacing.xl },
  entryTitle: { ...type.card, color: colors.text },
  entryMeta: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  story: { ...type.body, color: colors.primary, marginTop: spacing.sm },
  photoNote: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  entryCard: { borderLeftColor: '#A65D25', borderLeftWidth: 4 },
  empty: { ...type.body, color: colors.secondary, marginTop: spacing.sm },
});
