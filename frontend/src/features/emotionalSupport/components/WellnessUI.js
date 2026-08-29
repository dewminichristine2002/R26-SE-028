import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, type } from '../theme';

export function WellnessBackdrop({ variant = 'mint' }) {
  const tint = variant === 'warm' ? colors.peach : variant === 'sky' ? colors.sky : colors.mint;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}><View style={[s.orbLarge, { backgroundColor: tint }]} /><View style={s.orbSmall} /><View style={s.arc} /></View>;
}

export function Greeting({ text, subtitle = "Let's check in for a moment." }) {
  return <View accessibilityRole="header" style={s.greeting}><Text style={s.greetingText}>{text}</Text><Text style={s.greetingSubtitle}>{subtitle}</Text></View>;
}

export function ScreenHeader({ title, subtitle, navigation, eyebrow }) {
  return <View style={s.header}>
    {navigation ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={({ pressed }) => [s.back, pressed && s.pressed]}><Text style={s.backText}>‹</Text></Pressable> : null}
    <View style={s.headerCopy}>{eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}<View style={s.titleRow}><View style={s.titleAccent} /><Text style={s.title}>{title}</Text></View>{subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}</View>
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

export function OrganicIcon({ color = colors.primary, soft = colors.mint, label = '' }) { return <View style={[s.organicIcon, { backgroundColor: soft }]}><View style={[s.organicCircle, { borderColor: color }]} /><View style={[s.organicSquare, { backgroundColor: color }]} />{label ? <Text style={[s.organicLabel, { color }]}>{label}</Text> : null}</View>; }

export function InlineState({ loading, error, empty, emptyTitle, emptyText, onRetry }) {
  if (!loading && !error && !empty) return null;
  return <View style={[s.state, error && s.errorState]}>{loading ? <ActivityIndicator color={colors.primary} /> : <View style={s.stateIcon}><Text style={s.stateIconText}>{error ? '!' : '○'}</Text></View>}<View style={s.stateCopy}><Text style={s.stateTitle}>{loading ? 'Loading…' : error ? "Something didn't load" : emptyTitle || 'Nothing here yet'}</Text><Text style={s.stateText}>{loading ? emptyText || 'Preparing this for you…' : error ? "Please try again in a moment." : emptyText}</Text>{error && onRetry ? <Pressable onPress={onRetry} style={s.retry}><Text style={s.retryText}>Try Again</Text></Pressable> : null}</View></View>;
}

const s = StyleSheet.create({
  orbLarge: { borderRadius: 150, height: 280, opacity: 0.42, position: 'absolute', right: -130, top: -100, width: 280 }, orbSmall: { backgroundColor: colors.lavender, borderRadius: 70, height: 140, left: -75, opacity: 0.32, position: 'absolute', top: 330, width: 140 }, arc: { borderColor: colors.amber, borderRadius: 100, borderWidth: 18, bottom: 30, height: 150, opacity: 0.18, position: 'absolute', right: -95, width: 150 }, greeting: { marginBottom: spacing.lg }, greetingText: { color: colors.text, fontSize: 22, fontWeight: '900', lineHeight: 29 }, greetingSubtitle: { ...type.body, color: colors.secondary, marginTop: spacing.xs },
  header: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl }, headerCopy: { flex: 1 }, titleRow: { alignItems: 'flex-start', flexDirection: 'row' }, titleAccent: { backgroundColor: colors.primary, borderRadius: 3, height: 28, marginRight: spacing.sm, marginTop: 5, width: 4 },
  back: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.button, borderWidth: 1, height: 52, justifyContent: 'center', width: 52 }, backText: { color: colors.primary, fontSize: 36, lineHeight: 39 },
  eyebrow: { ...type.meta, color: colors.primary, letterSpacing: 0.8, marginBottom: spacing.xs, textTransform: 'uppercase' }, title: { ...type.screen, color: colors.text }, subtitle: { ...type.body, color: colors.secondary, marginTop: spacing.sm },
  card: { ...shadows.level2, backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, padding: spacing.xl },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.button, justifyContent: 'center', minHeight: 58, paddingHorizontal: spacing.xl, paddingVertical: spacing.md }, buttonText: { ...type.button, color: colors.white, textAlign: 'center' }, secondaryButton: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1.5 }, secondaryButtonText: { color: colors.primary }, disabled: { backgroundColor: colors.disabled, opacity: 0.75 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' }, progressText: { ...type.body, color: colors.text, fontWeight: '900' }, progressMeta: { ...type.meta, color: colors.secondary }, segments: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }, segment: { backgroundColor: colors.border, borderRadius: radius.pill, flex: 1, height: 8 }, currentSegment: { opacity: 0.82, transform: [{ scaleY: 1.35 }] },
  chip: { alignItems: 'center', borderRadius: radius.pill, flexDirection: 'row', minHeight: 36, paddingHorizontal: spacing.md }, chipDot: { borderRadius: 4, height: 7, marginRight: spacing.sm, width: 7 }, chipText: { ...type.meta, fontWeight: '900' }, organicIcon: { alignItems: 'center', borderRadius: 25, height: 58, justifyContent: 'center', overflow: 'hidden', width: 58 }, organicCircle: { borderRadius: 15, borderWidth: 2, height: 30, left: 9, opacity: 0.72, position: 'absolute', top: 8, width: 30 }, organicSquare: { borderRadius: 8, bottom: 8, height: 22, opacity: 0.55, position: 'absolute', right: 8, transform: [{ rotate: '20deg' }], width: 22 }, organicLabel: { fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  state: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg }, errorState: { backgroundColor: colors.errorBg }, stateIcon: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 22, height: 44, justifyContent: 'center', width: 44 }, stateIconText: { color: colors.primary, fontSize: 22, fontWeight: '900' }, stateCopy: { flex: 1 }, stateTitle: { ...type.card, color: colors.text }, stateText: { ...type.meta, color: colors.secondary, marginTop: 2 }, retry: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: spacing.xs }, retryText: { ...type.meta, color: colors.primary, fontWeight: '900' },
});
