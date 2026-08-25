import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, OrganicIcon, ScreenHeader, WellnessBackdrop } from '../components/WellnessUI';
import { colors, radius, screenInsets, spacing, type } from '../theme';

/**
 * REMEMBER hub — entered only after the elder chooses
 * "Remember Something Nice" on Home. Keeps Home uncluttered.
 *
 * Three gentle entry points:
 * - Suggested Memory Prompt  (personalized or generic)
 * - My Remembered Topics     (consented topics + management)
 * - Remember with a Photo    (user-selected photo cue; no analysis)
 */
export default function ReminiscenceHubScreen({ navigation }) {
  return (
    <SafeAreaView style={s.safe}><WellnessBackdrop variant="warm" />
      <ScrollView contentContainerStyle={s.container}>
        <ScreenHeader navigation={navigation} eyebrow="REMEMBER SOMETHING NICE" title="A Gentle Memory Moment" subtitle="Recall something pleasant, at your own pace." />

        <Pressable accessibilityRole="button" accessibilityLabel="Suggested memory prompt" onPress={() => navigation.navigate('MemoryMomentScreen', {})} style={({ pressed }) => pressed && s.pressed}>
          <Card style={[s.optionCard, s.promptCard]}>
            <OrganicIcon color="#9A654C" soft="#FFFFFF88" label="PROMPT" />
            <View style={s.copy}>
              <Text style={s.title}>Suggested Memory Prompt</Text>
              <Text style={s.text}>We'll offer a warm question to get you started.</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Card>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="My remembered topics" onPress={() => navigation.navigate('RememberedTopicsScreen')} style={({ pressed }) => pressed && s.pressed}>
          <Card style={[s.optionCard, s.topicsCard]}>
            <OrganicIcon color="#397668" soft="#FFFFFF88" label="TOPICS" />
            <View style={s.copy}>
              <Text style={s.title}>My Remembered Topics</Text>
              <Text style={s.text}>Topics you asked us to remember for future prompts.</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Card>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Remember with a photo" onPress={() => navigation.navigate('PhotoMemoryScreen')} style={({ pressed }) => pressed && s.pressed}>
          <Card style={[s.optionCard, s.photoCard]}>
            <OrganicIcon color="#89691F" soft="#FFFFFF88" label="PHOTO" />
            <View style={s.copy}>
              <Text style={s.title}>Remember with a Photo</Text>
              <Text style={s.text}>Choose a photo yourself and tell us what it brings to mind.</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Card>
        </Pressable>

        <Text style={s.note}>Your memories stay yours. Nothing is remembered without your permission.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { backgroundColor: '#FFF9F3', flex: 1 },
  container: { paddingHorizontal: spacing.xl, paddingTop: screenInsets.top, paddingBottom: screenInsets.bottom + spacing.xl },
  optionCard: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.md },
  promptCard: { backgroundColor: '#FFF0E6' },
  topicsCard: { backgroundColor: '#EDF6F1' },
  photoCard: { backgroundColor: '#FDF6E3' },
  copy: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  title: { ...type.card, color: colors.text, fontSize: 19, lineHeight: 25 },
  text: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  chevron: { color: colors.primary, fontSize: 31, marginLeft: spacing.sm },
  note: { ...type.meta, color: colors.secondary, marginTop: spacing.lg, textAlign: 'center' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.988 }] },
});
