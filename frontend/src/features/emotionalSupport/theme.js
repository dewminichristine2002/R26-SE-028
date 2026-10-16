import { Platform, StatusBar } from 'react-native';

export const colors = {
  primary: '#2f6654', primaryDark: '#2f6654', forest: '#2f6654', gold: '#e5c44f',
  text: '#18352f', secondary: '#5e5143', background: '#f7efe4', surface: '#fffdf8',
  mint: '#e3f8ee', sky: '#eaf7ff', lavender: '#f3edff', peach: '#fff7ed',
  amber: '#fff4b8', coral: '#fff1f4', violet: '#f3edff', border: '#eadfcd',
  disabled: '#b8ad9d', info: '#2576a6', error: '#a93447', errorBg: '#fff1f4', white: '#FFFFFF',
};

export const emotionStyles = {
  happiness: { accent: '#9B741D', soft: colors.amber }, sadness: { accent: '#3E7189', soft: colors.sky },
  loneliness: { accent: '#6C5B91', soft: colors.lavender }, anxiety: { accent: '#9A654C', soft: colors.peach },
  anger: { accent: '#935D59', soft: colors.coral }, cognitive_fog: { accent: '#68588D', soft: colors.violet },
  neutral: { accent: '#52756D', soft: colors.mint },
};

export const activityStyles = {
  word_category: { accent: '#5b3ca4', soft: colors.lavender, symbol: 'Aa' },
  odd_one_out: { accent: '#2576a6', soft: colors.sky, symbol: '🔎' },
  word_completion: { accent: '#985111', soft: colors.peach, symbol: 'A_' },
  pattern_sequence: { accent: '#2576a6', soft: colors.sky, symbol: '◯ □ △' },
  short_memory_recall: { accent: '#985111', soft: '#fff4b8', symbol: '♡' },
  orientation_activity: { accent: '#168464', soft: colors.mint, symbol: '🧭' },
  simple_math: { accent: '#7b5700', soft: colors.amber, symbol: '+' },
  sequence_ordering: { accent: '#5b3ca4', soft: colors.lavender, symbol: '1·2·3' },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
export const radius = { small: 12, button: 16, card: 22, hero: 26, pill: 999 };
export const type = {
  screen: { fontSize: 32, lineHeight: 39, fontWeight: '900' },
  section: { fontSize: 23, lineHeight: 30, fontWeight: '900' },
  question: { fontSize: 24, lineHeight: 33, fontWeight: '900' },
  card: { fontSize: 20, lineHeight: 27, fontWeight: '900' },
  body: { fontSize: 17, lineHeight: 25, fontWeight: '600' },
  meta: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  button: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
};

export const shadow = { shadowColor: '#7a674f', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 9, elevation: 3 };
export const shadows = {
  level1: { elevation: 0 },
  level2: shadow,
  level3: { shadowColor: '#725e25', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 5 },
};
export const screenInsets = { top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + spacing.lg : spacing.xl, bottom: Platform.OS === 'android' ? spacing.xxl : spacing.xl };

export const friendlyError = () => "We couldn't load this right now. Please try again.";
