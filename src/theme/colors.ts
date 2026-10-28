export interface ColorScheme {
  // Backgrounds
  background: string;
  backgroundCard: string;
  backgroundInput: string;
  backgroundPressed: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverted: string;

  // Accents
  accent: string;
  accentLight: string;
  success: string;
  warning: string;
  danger: string;

  // UI elements
  border: string;
  tabBar: string;
  tabBarBorder: string;
  cardShadow: string;

  // Statuses
  statusNew: string;
  statusRepeat: string;
  statusLearned: string;
  error?: string;

  // Nocturne (redesign plan 01). Roles are fixed, values come from the scheme;
  // components must never branch on isDark for a colour.
  bg: string;
  surface: string;
  text: string;
  accentBase: string;
  accent100: string;
  accent200: string;
  accent300: string;
  accent400: string;
  accent500: string;
  accent600: string;
  accent700: string;
  accent800: string;
  accent900: string;
  neutral100: string;
  neutral200: string;
  neutral300: string;
  neutral400: string;
  neutral500: string;
  neutral600: string;
  neutral700: string;
  neutral800: string;
  neutral900: string;
}

// NOTE: Nocturne also defines `accent` (dark #9184d9 / light #796cbf), which
// clashes with the legacy `accent` (#7c74ff / #6c63ff). Left legacy for now.
type NocturneKeys =
  | 'bg' | 'surface' | 'text' | 'accentBase'
  | 'accent100' | 'accent200' | 'accent300' | 'accent400' | 'accent500'
  | 'accent600' | 'accent700' | 'accent800' | 'accent900'
  | 'neutral100' | 'neutral200' | 'neutral300' | 'neutral400' | 'neutral500'
  | 'neutral600' | 'neutral700' | 'neutral800' | 'neutral900';

export const NOCTURNE_KEYS: readonly NocturneKeys[] = [
  'bg', 'surface', 'text', 'accentBase',
  'accent100', 'accent200', 'accent300', 'accent400', 'accent500',
  'accent600', 'accent700', 'accent800', 'accent900',
  'neutral100', 'neutral200', 'neutral300', 'neutral400', 'neutral500',
  'neutral600', 'neutral700', 'neutral800', 'neutral900',
];

const nocturneDark: Pick<ColorScheme, NocturneKeys> = {
  bg: '#161826', surface: '#232532', text: '#e9e9ed', accentBase: '#9184d9',
  accent100: '#f5f4ff', accent200: '#e7e5fe', accent300: '#d2cefd',
  accent400: '#b5abfc', accent500: '#968ae0', accent600: '#796cbf',
  accent700: '#5d5294', accent800: '#423a6a', accent900: '#2b2741',
  neutral100: '#f3f5fe', neutral200: '#e4e7f5', neutral300: '#cfd3e5',
  neutral400: '#b2b6ca', neutral500: '#9397ab', neutral600: '#75798c',
  neutral700: '#595d6c', neutral800: '#3f424d', neutral900: '#292b31',
};

const nocturneLight: Pick<ColorScheme, NocturneKeys> = {
  bg: '#eceef7', surface: '#f8f9fe', text: '#1d1f2c', accentBase: '#796cbf',
  accent100: '#2b2741', accent200: '#423a6a', accent300: '#5d5294',
  accent400: '#6a5fae', accent500: '#796cbf', accent600: '#968ae0',
  accent700: '#d2cefd', accent800: '#e1ddfb', accent900: '#efedfd',
  neutral100: '#292b31', neutral200: '#3f424d', neutral300: '#4a4e5c',
  neutral400: '#5c6072', neutral500: '#6c7083', neutral600: '#9397ab',
  neutral700: '#c3c7d8', neutral800: '#dcdfeb', neutral900: '#e2e5f1',
};

export const lightColors: ColorScheme = {
  background: '#f0f0f7',
  backgroundCard: '#ffffff',
  backgroundInput: '#f8f8ff',
  backgroundPressed: '#e8e8f0',

  textPrimary: '#1a1a2e',
  textSecondary: '#555566',
  textMuted: '#aaaabb',
  textInverted: '#ffffff',

  accent: '#6c63ff',
  accentLight: 'rgba(108, 99, 255, 0.12)',
  success: '#34c759',
  warning: '#ff9f43',
  danger: '#ff3b30',

  border: '#f0f0f7',
  tabBar: '#ffffff',
  tabBarBorder: '#f0f0f7',
  cardShadow: 'rgba(0, 0, 0, 0.08)',

  statusNew: '#6c63ff',
  statusRepeat: '#ff9f43',
  statusLearned: '#34c759',

  ...nocturneLight,
};

export const darkColors: ColorScheme = {
  background: '#0f0f1a',
  backgroundCard: '#1a1a2e',
  backgroundInput: '#242438',
  backgroundPressed: '#2a2a40',

  textPrimary: '#f0f0ff',
  textSecondary: '#aaaacc',
  textMuted: '#666688',
  textInverted: '#1a1a2e',

  accent: '#7c74ff',
  accentLight: 'rgba(124, 116, 255, 0.15)',
  success: '#30d158',
  warning: '#ffa040',
  danger: '#ff453a',

  border: '#2a2a40',
  tabBar: '#1a1a2e',
  tabBarBorder: '#2a2a40',
  cardShadow: 'rgba(0, 0, 0, 0.4)',

  statusNew: '#7c74ff',
  statusRepeat: '#ffa040',
  statusLearned: '#30d158',

  ...nocturneDark,
};
