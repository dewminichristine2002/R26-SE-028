import { Platform, StatusBar } from 'react-native';

export const colors = {
  primary: '#24796D', primaryDark: '#185F56', text: '#173F3A', secondary: '#607770',
  background: '#F5FAF8', surface: '#FFFFFF', mint: '#E2F3ED', sky: '#DDEFF8',
  lavender: '#EEE8F8', peach: '#FCE8DC', amber: '#F8E4AE', coral: '#F4D4CF',
  violet: '#E8E1F4', border: '#D9E8E3', disabled: '#A9C1BA', info: '#376F86',
  error: '#8A4B4B', errorBg: '#FAECEA', white: '#FFFFFF',
};

export const emotionStyles = {
  happiness: { accent: '#9B741D', soft: colors.amber }, sadness: { accent: '#3E7189', soft: colors.sky },
  loneliness: { accent: '#6C5B91', soft: colors.lavender }, anxiety: { accent: '#9A654C', soft: colors.peach },
  anger: { accent: '#935D59', soft: colors.coral }, cognitive_fog: { accent: '#68588D', soft: colors.violet },
  neutral: { accent: '#52756D', soft: colors.mint },
};

export const activityStyles = {
  word_category: { accent: '#6C5B91', soft: colors.lavender, symbol: 'Aa' },
  odd_one_out: { accent: '#3E7189', soft: colors.sky, symbol: 'ONE' },
  word_completion: { accent: '#9A654C', soft: colors.peach, symbol: 'A_' },
  pattern_sequence: { accent: '#31758A', soft: colors.sky, symbol: 'O  □' },
  short_memory_recall: { accent: '#9A654C', soft: '#FFF1D7', symbol: 'MEM' },
  orientation_activity: { accent: '#397668', soft: colors.mint, symbol: 'N' },
  simple_math: { accent: '#89691F', soft: colors.amber, symbol: '1+2' },
  sequence_ordering: { accent: '#625F91', soft: colors.lavender, symbol: '1 2 3' },
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

export const shadow = { shadowColor: '#173F3A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 };
export const shadows = {
  level1: { elevation: 0 },
  level2: shadow,
  level3: { shadowColor: '#173F3A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 4 },
};
export const screenInsets = { top: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + spacing.lg : spacing.xl, bottom: Platform.OS === 'android' ? spacing.xxl : spacing.xl };

export const friendlyError = () => "We couldn't load this right now. Please try again.";
