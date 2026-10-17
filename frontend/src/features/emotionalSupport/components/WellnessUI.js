import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, type } from '../theme';
import HeaderAccountActions from '../../../components/HeaderAccountActions';

export function WellnessBackdrop({ variant = 'mint' }) {
  const tint = variant === 'warm' ? colors.amber : variant === 'sky' ? colors.sky : colors.mint;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><View style={[s.orbLarge, { backgroundColor: tint }]} /><View style={s.orbSmall} /><View style={s.arc} /></View>;
}

export function Greeting({ text, subtitle = "Let's check in for a moment.", emoji = '☀️' }) {
  return <View accessibilityRole="header" style={s.greeting}><View style={s.greetingIcon}><Text style={s.greetingEmoji}>{emoji}</Text></View><View style={s.greetingCopy}><Text style={s.greetingText}>{text}</Text><Text style={s.greetingSubtitle}>{subtitle}</Text></View></View>;
}

export function ScreenHeader({ title, subtitle, navigation, eyebrow }) {
  return <View style={s.header}>
    {navigation ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={({ pressed }) => [s.back, pressed && s.pressed]}><Text style={s.backText}>‹</Text></Pressable> : null}
    <View style={s.headerCopy}>{eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}<View style={s.titleRow}><View style={s.titleAccent} /><Text style={s.title}>{title}</Text></View>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View>
    <HeaderAccountActions />
  </View>;
}

export function Card({ children, style, accent }) { return <View style={[s.card, accent && { borderTopWidth: 4, borderTopColor: accent }, style]}>{children}</View>; }

export function Button({ label, onPress, disabled, loading, variant = 'primary', style, accessibilityLabel }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [s.button, variant === 'secondary' && s.secondaryButton, disabled && s.disabled, pressed && s.pressed, style]}>
    {loading ? <ActivityIndicator color={variant === 'primary' ? colors.white : colors.primary} /> : <Text style={[s.buttonText, variant === 'secondary' && s.secondaryButtonText]}>{label}</Text>}
  </Pressable>;
}

export function Progress({ current, total, accent = colors.primary }) {
  return <View accessibilityLabel={`Question ${current} of ${total}`}><View style={s.progressLabels}><Text style={s.progressText}>Question {current} of {total}</Text><Text style={s.progressMeta}>One question at a time</Text></View><View style={s.segments}>{Array.from({ length: total }).map((_, i) => <View key={i} style={[s.segment, i < current && { backgroundColor: accent }, i === current - 1 && s.currentSegment]} />)}</View></View>;
}

export function MetaChip({ label, tint = colors.mint, color = colors.primary }) { return <View style={[s.chip, { backgroundColor: tint }]}><View style={[s.chipDot, { backgroundColor: color }]} /><Text numberOfLines={1} adjustsFontSizeToFit style={[s.chipText, { color }]}>{label}</Text></View>; }

const iconGlyphs = {
  PLAY: '▶', MEM: '♡', UP: '↗', LIFE: '◷', PIN: '⌖', TOPICS: '✦', TOPIC: '✦', PHOTO: '▧', PROMPT: '“',
  AA: 'Aa', ONE: '◉', 'A_': 'A_', 'O  □': '◌', N: 'N', '1+2': '+', '1 2 3': '123',
  '🔎': '🔎', '◯ □ △': '◯ □ △', '♡': '♡', '🧭': '🧭', '+': '+', '1·2·3': '1·2·3',
};

export function OrganicIcon({ color = colors.primary, soft = colors.mint, label = '' }) {
  const key = String(label || '').trim().toUpperCase();
  const glyph = iconGlyphs[key] || '✦';
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.organicIcon, { backgroundColor: soft }]}>
      <Text style={[s.organicGlyph, { color }]}>{glyph}</Text>
    </View>
  );
}

export function InlineState({ loading, error, empty, emptyTitle, emptyText, errorTitle, errorText, onRetry }) {
  if (!loading && !error && !empty) return null;
  return <View style={[s.state, error && s.errorState]}>{loading ? <ActivityIndicator color={colors.primary} /> : <View style={s.stateIcon}><Text style={s.stateIconText}>{error ? '!' : '○'}</Text></View>}<View style={s.stateCopy}><Text style={s.stateTitle}>{loading ? 'Loading…' : error ? errorTitle || "Something didn't load" : emptyTitle || 'Nothing here yet'}</Text><Text style={s.stateText}>{loading ? emptyText || 'Preparing this for you…' : error ? errorText || "Please try again in a moment." : emptyText}</Text>{error && onRetry ? <Pressable onPress={onRetry} style={s.retry}><Text style={s.retryText}>Try Again</Text></Pressable> : null}</View></View>;
}

const s = StyleSheet.create({
  orbLarge: { borderRadius: 150, height: 280, opacity: 0.24, position: 'absolute', right: -130, top: -100, width: 280 }, orbSmall: { backgroundColor: colors.mint, borderRadius: 70, height: 140, left: -75, opacity: 0.48, position: 'absolute', top: 330, width: 140 }, arc: { borderColor: colors.gold, borderRadius: 100, borderWidth: 18, bottom: 30, height: 150, opacity: 0.15, position: 'absolute', right: -95, width: 150 }, greeting: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.gold, borderRadius: radius.hero, borderWidth: 2, flexDirection: 'row', marginBottom: spacing.lg, minHeight: 116, paddingHorizontal: 18, paddingVertical: 16, ...shadows.level2 }, greetingIcon: { alignItems: 'center', backgroundColor: '#FFF4B8', borderRadius: 20, height: 62, justifyContent: 'center', marginRight: 14, width: 62 }, greetingEmoji: { fontSize: 30 }, greetingCopy: { flex: 1 }, greetingText: { color: colors.white, fontSize: 25, fontWeight: '900', lineHeight: 32 }, greetingSubtitle: { ...type.body, color: '#ECFFF6', fontSize: 16, marginTop: spacing.xs },
  header: { backgroundColor: '#275C4B', borderColor: '#F4CF75', borderRadius: 22, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl, padding: 10, minHeight: 72, ...shadows.level1 }, headerCopy: { flex: 1, minWidth: 0 }, titleRow: { alignItems: 'flex-start', flexDirection: 'row' }, titleAccent: { backgroundColor: '#F8D978', borderRadius: 3, height: 25, marginRight: spacing.sm, marginTop: 4, width: 4 },
  back: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 }, backText: { color: colors.primary, fontSize: 36, lineHeight: 39 },
  eyebrow: { ...type.meta, color: '#D9F2E5', letterSpacing: 0.8, marginBottom: spacing.xs, textTransform: 'uppercase' }, title: { ...type.screen, color: '#FFFFFF', fontSize: 23, lineHeight: 30, flexShrink: 1 }, subtitle: { ...type.body, color: '#EAF7F0', marginTop: spacing.sm },
  card: { ...shadows.level2, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, padding: spacing.xl },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.button, justifyContent: 'center', minHeight: 58, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }, buttonText: { ...type.button, color: colors.white, textAlign: 'center' }, secondaryButton: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1.5 }, secondaryButtonText: { color: colors.primary }, disabled: { backgroundColor: colors.disabled, opacity: 0.75 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' }, progressText: { ...type.body, color: colors.text, fontWeight: '900' }, progressMeta: { ...type.meta, color: colors.secondary }, segments: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }, segment: { backgroundColor: colors.border, borderRadius: radius.pill, flex: 1, height: 8 }, currentSegment: { opacity: 0.82, transform: [{ scaleY: 1.35 }] },
  chip: { alignItems: 'center', borderRadius: radius.pill, flexDirection: 'row', minHeight: 36, paddingHorizontal: spacing.md }, chipDot: { borderRadius: 4, height: 7, marginRight: spacing.sm, width: 7 }, chipText: { ...type.meta, fontWeight: '900' }, organicIcon: { alignItems: 'center', borderColor: colors.border, borderRadius: 20, borderWidth: 1, height: 60, justifyContent: 'center', width: 60 }, organicGlyph: { fontSize: 25, fontWeight: '900', textAlign: 'center' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  state: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg }, errorState: { backgroundColor: colors.errorBg }, stateIcon: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 }, stateIconText: { color: colors.primary, fontSize: 22, fontWeight: '900' }, stateCopy: { flex: 1 }, stateTitle: { ...type.card, color: colors.text }, stateText: { ...type.meta, color: colors.secondary, marginTop: 2 }, retry: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: spacing.xs }, retryText: { ...type.meta, color: colors.primary, fontWeight: '900' },
});
