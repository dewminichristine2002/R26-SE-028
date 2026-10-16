import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listMemoryEntries } from '../api/emotionalSupportApi';
import { Button, Card, InlineState, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { useEmotionalSupportContext } from '../context/EmotionalSupportContext';
import { colors, radius, screenInsets, spacing, type } from '../theme';
import PrivateMemoryPhoto from '../components/PrivateMemoryPhoto';

const prettyType = (entryType) => entryType === 'good_deed' ? 'Good deed or proud moment' : 'Life Book story';
const formatMemoryDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function RevisitMemoriesScreen({ navigation }) {
  const { elderId } = useEmotionalSupportContext();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!elderId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(false);
      const result = await listMemoryEntries(elderId);
      setEntries((result?.entries || []).filter((entry) => ['life_book', 'good_deed'].includes(entry.entryType)));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [elderId]);

  useEffect(() => { load(); }, [load]);

  return <SafeAreaView style={s.safe}>
    <WellnessBackdrop variant="warm" />
    <ScrollView contentContainerStyle={s.container}>
      <ScreenHeader navigation={navigation} eyebrow="YOUR SAVED MOMENTS" title="Revisit My Memories" subtitle="Choose a story you decided to save. You can take your time, change topic, or finish whenever you like." />
      {!loading && !error && entries.length > 0 ? <Card style={s.albumIntro}><View style={s.albumMark}><Text style={s.albumMarkText}>♡</Text></View><View style={s.albumCopy}><Text style={s.albumEyebrow}>YOUR PRIVATE ALBUM</Text><Text style={s.albumTitle}>{entries.length} saved {entries.length === 1 ? 'moment' : 'moments'}</Text><Text style={s.albumText}>Only moments saved in your account appear here.</Text></View></Card> : null}
      <InlineState
        loading={loading}
        error={error}
        onRetry={load}
        empty={!loading && !error && entries.length === 0}
        emptyTitle="No saved stories yet"
        emptyText="Stories you save in My Life Book or Good Deeds will be available here. Nothing is added unless you choose Save."
      />
      {!loading && !error && entries.map((entry) => (
        <Card key={entry.id} style={s.memoryCard}>
          <View style={s.entryHeading}>
            <View style={s.mark}><Text style={s.markText}>{entry.entryType === 'good_deed' ? '♡' : '◷'}</Text></View>
            <View style={s.entryCopy}>
              <Text style={s.entryType}>{prettyType(entry.entryType)}</Text>
              <Text accessibilityRole="header" style={s.entryTitle}>{entry.title}</Text>
            </View>
          </View>
          {entry.category ? <Text style={s.category}>{entry.category}</Text> : null}
          {entry.photoUrl || entry.photoUnavailable ? <PrivateMemoryPhoto entryId={entry.id} userId={elderId} photoUrl={entry.photoUrl} style={s.photo} /> : null}
          {entry.memoryDate ? <Text style={s.date}>{formatMemoryDate(entry.memoryDate)}</Text> : null}
          <View style={s.storyCue}><Text style={s.storyCueMark}>i</Text><Text style={s.storyMissing}>{entry.story ? 'A written story is saved with this moment. Tap below if you would like to revisit it.' : 'You saved this title without a written description.'}</Text></View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Revisit ${entry.title}`}
            onPress={() => navigation.navigate('MemoryConversationScreen', { entryId: entry.id })}
            style={({ pressed }) => [s.revisitButton, pressed && s.pressed]}
          >
            <Text style={s.revisitText}>Revisit this memory</Text>
            <Text accessibilityElementsHidden style={s.arrow}>›</Text>
          </Pressable>
        </Card>
      ))}
      <Button variant="secondary" label="Manage remembered topics" onPress={() => navigation.navigate('RememberedTopicsScreen')} style={s.manageButton} />
      <Text style={s.note}>These are words you chose to save. They are not independently verified facts, and you never need to remember or discuss anything.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  albumIntro: { alignItems: 'center', backgroundColor: '#FFF9F5', borderColor: '#EAD9D5', flexDirection: 'row', marginBottom: spacing.md, padding: spacing.lg },
  albumMark: { alignItems: 'center', backgroundColor: '#F8EDEF', borderRadius: 18, height: 54, justifyContent: 'center', width: 54 },
  albumMarkText: { color: '#98566C', fontSize: 29, fontWeight: '900' },
  albumCopy: { flex: 1, marginLeft: spacing.md },
  albumEyebrow: { ...type.meta, color: '#98566C', letterSpacing: 0.8 },
  albumTitle: { ...type.card, color: colors.text, marginTop: 2 },
  albumText: { ...type.meta, color: colors.secondary, marginTop: 2 },
  memoryCard: { marginTop: spacing.md, overflow: 'hidden', padding: spacing.lg },
  entryHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  mark: { alignItems: 'center', backgroundColor: colors.peach, borderRadius: 18, height: 58, justifyContent: 'center', width: 58 },
  markText: { color: '#98566C', fontSize: 27, fontWeight: '900' },
  entryCopy: { flex: 1, minWidth: 0 },
  entryType: { ...type.meta, color: '#98566C', fontWeight: '900' },
  entryTitle: { ...type.card, color: colors.text, marginTop: 2 },
  category: { ...type.meta, color: colors.secondary, marginTop: spacing.md },
  date: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  story: { ...type.body, color: colors.text, marginTop: spacing.md },
  photo: { borderRadius: 18, height: 210, marginTop: spacing.md, width: '100%' },
  storyCue: { alignItems: 'flex-start', backgroundColor: '#F7F4F1', borderRadius: 16, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  storyCueMark: { color: '#765692', fontSize: 17, fontWeight: '900' },
  storyMissing: { ...type.meta, color: colors.secondary, flex: 1 },
  revisitButton: { alignItems: 'center', backgroundColor: '#98566C', borderColor: '#98566C', borderRadius: radius.button, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg, minHeight: 58, paddingHorizontal: spacing.md },
  revisitText: { ...type.button, color: colors.white },
  arrow: { color: colors.white, fontSize: 27, marginLeft: spacing.sm },
  manageButton: { marginTop: spacing.lg },
  note: { ...type.meta, color: colors.secondary, marginTop: spacing.lg, textAlign: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
