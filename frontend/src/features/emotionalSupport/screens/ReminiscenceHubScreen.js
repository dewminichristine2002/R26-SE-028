import React from 'react';
import HeaderAccountActions from '../../../components/HeaderAccountActions';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, WellnessBackdrop } from '../components/WellnessUI';
import { colors, screenInsets, spacing, type } from '../theme';

const OPTIONS = [
  {
    label: 'Revisit My Memories',
    description: 'Reconnect with saved photos and stories.',
    action: 'Begin Memory Session',
    icon: '\u2661',
    color: '#98566C',
    tint: '#F8EDEF',
    route: 'RevisitMemoriesScreen',
  },
  {
    label: 'My Life Book',
    description: 'Organize your personal photos and stories.',
    action: 'Open Life Book',
    icon: '\u25A4',
    color: '#936638',
    tint: '#FBF1E6',
    route: 'MyLifeBook',
  },
  {
    label: 'Guided Memories',
    description: 'Explore gentle memory prompts.',
    action: 'Start Guided Memories',
    icon: '\u2026',
    color: '#70538B',
    tint: '#F0ECF8',
    route: 'MemoryMomentScreen',
  },
];

export default function ReminiscenceHubScreen({ navigation }) {
  return (
    <SafeAreaView style={s.safe}>
      <WellnessBackdrop variant="warm" />
      <View style={s.headerTop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [s.back, pressed && s.pressed]}
            >
              <Text style={s.backText}>{'\u2039'}</Text>
            </Pressable>
            <Text style={s.eyebrow}>MEMORY CORNER</Text>
            <HeaderAccountActions />
      </View>
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.header}>
          <Text accessibilityRole="header" style={s.screenTitle}>Remember Something Nice</Text>
          <Text style={s.subtitle}>Enjoy meaningful moments at your own pace.</Text>
        </View>

        <View style={s.options}>
          {OPTIONS.map((option) => (
            <Card key={option.route} style={s.optionCard}>
              <View style={s.cardTop}>
                <View style={[s.iconFrame, { backgroundColor: option.tint }]} accessibilityElementsHidden>
                  <Text style={[s.icon, { color: option.color }]}>{option.icon}</Text>
                </View>
                <Text accessibilityRole="header" style={s.title}>{option.label}</Text>
              </View>
              <Text style={s.description}>{option.description}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={option.action}
                onPress={() => navigation.navigate(option.route)}
                style={({ pressed }) => [s.actionButton, { backgroundColor: option.color }, pressed && s.pressed]}
              >
                <Text style={s.actionText}>{option.action}</Text>
              </Pressable>
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: screenInsets.bottom + spacing.lg },
  header: { marginBottom: spacing.lg },
  headerTop: { alignItems: 'center', flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: screenInsets.top, borderRadius: 22, borderWidth: 2, borderColor: '#F4CF75', backgroundColor: '#275C4B', padding: 10 },
  back: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, height: 44, justifyContent: 'center', marginRight: spacing.md, width: 44 },
  backText: { color: colors.primary, fontSize: 34, lineHeight: 38 },
  eyebrow: { ...type.meta, color: '#FFFFFF', letterSpacing: 1.1, flex: 1 },
  screenTitle: { color: colors.text, fontSize: 27, fontWeight: '900', lineHeight: 34 },
  subtitle: { ...type.body, color: colors.secondary, marginTop: spacing.xs },
  options: { gap: spacing.md },
  optionCard: { backgroundColor: colors.surface, borderColor: colors.border, padding: spacing.lg },
  cardTop: { alignItems: 'center', flexDirection: 'row' },
  iconFrame: { alignItems: 'center', borderColor: colors.border, borderRadius: 18, borderWidth: 1, height: 56, justifyContent: 'center', marginRight: spacing.md, width: 56 },
  icon: { fontSize: 30, fontWeight: '800', textAlign: 'center' },
  title: { color: colors.text, flex: 1, fontSize: 20, fontWeight: '900', lineHeight: 27, minWidth: 0 },
  description: { ...type.body, color: colors.secondary, marginTop: spacing.md },
  actionButton: { alignItems: 'center', borderRadius: 16, justifyContent: 'center', marginTop: spacing.md, minHeight: 56, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, width: '100%' },
  actionText: { ...type.button, color: colors.white, textAlign: 'center' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
});
