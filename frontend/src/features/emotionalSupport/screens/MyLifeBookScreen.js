import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, ScreenHeader, InlineState } from '../components/WellnessUI';
import { colors, spacing, type } from '../theme';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { createMemoryEntry, listMemoryEntries, deleteMemoryEntry } from '../api/emotionalSupportApi';

export default function MyLifeBookScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [entries, setEntries] = useState([]);
  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [memoryDate, setMemoryDate] = useState(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const lifeCategories = [
    'Early Years', 'School Days', 'Work & Career', 'Family Moments', 'Places I Lived', 'Hobbies', 'Celebrations', 'Travel', 'Music & Entertainment', 'Moments I Am Proud Of', 'Other'
  ];
  const [category, setCategory] = useState('Other');

  useEffect(() => {
    async function load() {
      if (!elderId) return;
      try {
        const res = await listMemoryEntries(elderId, 'life_book');
        if (res && res.entries) setEntries(res.entries);
      } catch (e) {
        // ignore
      }
    }
    load();
  }, [elderId]);

  async function choosePhoto() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission?.granted) {
        setError('Photo access is unavailable. You can still save an entry without a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) setPhotoUri(result.assets[0].uri);
    } catch {
      setError('Could not open photos right now.');
    }
  }


  function openCategoryPicker() {
    setShowCategoryPicker(true);
  }

  function selectCategory(c) {
    setCategory(c);
    setShowCategoryPicker(false);
  }

  function removePhoto() {
    setPhotoUri(null);
  }

  async function confirmDelete(entryId) {
    Alert.alert('Delete entry?', 'This will remove the entry from your Life Book.', [
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

  async function onSave() {
    setError('');
    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    setSaving(true);
    try {
      // Photo remains local-only; do not upload photoUri to server.
      await createMemoryEntry({ user_id: elderId, entry_type: 'life_book', title: title.trim(), category: category || null, story: story.trim() || null, memory_date: memoryDate || null });
      setTitle('');
      setStory('');
      setPhotoUri(null);
      setMemoryDate(null);
      setCategory('Other');
      const res = await listMemoryEntries(elderId, 'life_book');
      if (res && res.entries) setEntries(res.entries);
    } catch (e) {
      setError('Could not save the entry right now.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <ScreenHeader navigation={navigation} eyebrow="MY LIFE BOOK" title="Keep the stories of your life" />

        <Card>
          <Text style={s.label}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Entry title" style={s.input} />
          <Text style={s.label}>Short story / description</Text>
          <TextInput value={story} onChangeText={setStory} placeholder="Write a short story..." style={[s.input, { height: 120 }]} multiline />

          <Text style={[s.label, { marginTop: spacing.md }]}>Photo (optional)</Text>
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

          <Text style={[s.label, { marginTop: spacing.md }]}>Category (optional)</Text>
          <Pressable onPress={openCategoryPicker} style={{ paddingVertical: 8 }}>
            <Text style={{ ...type.card }}>{category}</Text>
          </Pressable>

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
                  {lifeCategories.map((c) => (
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
            <Button label="Save Entry" onPress={onSave} loading={saving} />
          </View>
        </Card>

        <Text style={{ ...type.hint, marginTop: spacing.md }}>Existing entries</Text>
        {entries.map((e) => (
          <Card key={e.id} style={{ marginTop: spacing.sm }}>
            <Text style={{ ...type.card }}>{e.title}</Text>
            {e.memoryDate ? <Text style={{ ...type.meta }}>{e.memoryDate}</Text> : null}
            {e.story ? <Text style={{ marginTop: spacing.xs }}>{e.story}</Text> : null}
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
  label: { ...type.meta, color: colors.secondary, marginTop: 8 },
  input: { borderColor: '#DDD', borderWidth: 1, borderRadius: 6, padding: 8, marginTop: 6, backgroundColor: '#FFF' },
});
