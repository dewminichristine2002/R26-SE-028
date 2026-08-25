import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import DateTimePicker from 'react-native-datetimepicker/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, ScreenHeader, InlineState } from '../components/WellnessUI';
import { colors, spacing, type } from '../theme';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { createMemoryEntry, listMemoryEntries, deleteMemoryEntry } from '../api/emotionalSupportApi';

export default function GoodDeedsScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [entries, setEntries] = useState([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [memoryDate, setMemoryDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const goodCategories = [
    'Helping Someone','Giving or Sharing','Family Support','Community Activity','Religious or Spiritual Activity','Visiting a Meaningful Place','Personal Achievement','Something I Am Grateful For','Other'
  ];


  useEffect(() => {
    async function load() {
      if (!elderId) return;
      try {
        const res = await listMemoryEntries(elderId, 'good_deed');
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
        setError('Photo access is unavailable. You can still save without a photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.7 });
      if (!result.canceled && result.assets?.[0]?.uri) setPhotoUri(result.assets[0].uri);
    } catch {
      setError('Could not open photos right now.');
    }
  }

  function removePhoto() {
    setPhotoUri(null);
  }

  function onDateChange(event, selectedDate) {
    setShowDatePicker(false);
    if (selectedDate) setMemoryDate(selectedDate.toISOString().slice(0,10));
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

  useEffect(() => {
    async function load() {
      if (!elderId) return;
      try {
        const res = await listMemoryEntries(elderId, 'good_deed');
        if (res && res.entries) setEntries(res.entries);
      } catch (e) {
        // ignore
      }
    }
    load();
  }, [elderId]);

  async function onSave() {
    setError('');
    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    setSaving(true);
    try {
      await createMemoryEntry({ user_id: elderId, entry_type: 'good_deed', title: title.trim(), category: category.trim() || null, story: note.trim() || null, memory_date: memoryDate || null });
      setTitle('');
      setCategory('');
      setNote('');
      setMemoryDate(null);
      const res = await listMemoryEntries(elderId, 'good_deed');
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
        <ScreenHeader navigation={navigation} eyebrow="MY GOOD DEEDS / PIN POTHA" title="Keep meaningful moments with a date, photo, and short note" />

        <Card>
          <Text style={s.label}>Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Short title" style={s.input} />
          <Text style={s.label}>Category (optional)</Text>
          <Pressable onPress={openCategoryPicker} style={{ paddingVertical: 8 }}>
            <Text style={{ ...type.card }}>{category || 'Choose a category'}</Text>
          </Pressable>

          <Text style={s.label}>Short note</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Write a short note..." style={[s.input, { height: 100 }]} multiline />

          <Text style={[s.label, { marginTop: spacing.md }]}>Photo (optional)</Text>
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
            <Button label="Save Entry" onPress={onSave} loading={saving} />
          </View>
        </Card>

        <Text style={{ ...type.hint, marginTop: spacing.md }}>Existing entries</Text>
        {entries.map((e) => (
          <Card key={e.id} style={{ marginTop: spacing.sm }}>
            <Text style={{ ...type.card }}>{e.title}</Text>
            {e.category ? <Text style={{ ...type.meta }}>{e.category}</Text> : null}
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
