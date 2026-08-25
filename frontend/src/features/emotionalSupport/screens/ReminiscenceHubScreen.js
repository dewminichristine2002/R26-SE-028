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
        <ScreenHeader navigation={navigation} eyebrow="REMEMBER SOMETHING NICE" title="Take a moment with memories that matter to you." subtitle="" />

        <Pressable accessibilityRole="button" accessibilityLabel="My Life Book" onPress={() => navigation.navigate('MyLifeBook')} style={({ pressed }) => pressed && s.pressed}>
          <Card style={[s.optionCard, s.lifeBookCard]}>
            <OrganicIcon color="#397668" soft="#FFFFFF88" label="LIFE" />
            <View style={s.copy}>
              <Text style={s.title}>My Life Book</Text>
              <Text style={s.text}>Keep the stories of your life.</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Card>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="My Good Deeds / Pin Potha" onPress={() => navigation.navigate('GoodDeeds')} style={({ pressed }) => pressed && s.pressed}>
          <Card style={[s.optionCard, s.goodDeedsCard]}>
            <OrganicIcon color="#9A654C" soft="#FFFFFF88" label="PIN" />
            <View style={s.copy}>
              <Text style={s.title}>My Good Deeds / Pin Potha</Text>
              <Text style={s.text}>Keep meaningful moments with a date, photo, and short note.</Text>
            </View>
            <Text style={s.chevron}>›</Text>
          </Card>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="My remembered topics" onPress={() => navigation.navigate('RememberedTopicsScreen')} style={({ pressed }) => pressed && s.pressed}>
          <Card style={[s.optionCard, s.topicsCard]}>
            <OrganicIcon color="#89691F" soft="#FFFFFF88" label="TOPICS" />
            <View style={s.copy}>
              <Text style={s.title}>Remembered Topics</Text>
              <Text style={s.text}>Save and revisit memories that matter to you.</Text>
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
  lifeBookCard: { backgroundColor: '#FFF4EC' },
  goodDeedsCard: { backgroundColor: '#FFF8F0' },
  topicsCard: { backgroundColor: '#EDF6F1' },
  copy: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  title: { ...type.card, color: colors.text, fontSize: 19, lineHeight: 25 },
  text: { ...type.meta, color: colors.secondary, marginTop: spacing.xs },
  chevron: { color: colors.primary, fontSize: 31, marginLeft: spacing.sm },
  note: { ...type.meta, color: colors.secondary, marginTop: spacing.lg, textAlign: 'center' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.988 }] },
});
