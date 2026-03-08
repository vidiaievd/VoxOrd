export interface ColorScheme {
  // Backgrounds
  background:        string;
  backgroundCard:    string;
  backgroundInput:   string;
  backgroundPressed: string;

  // Text
  textPrimary:       string;
  textSecondary:     string;
  textMuted:         string;
  textInverted:      string;

  // Accents
  accent:            string;
  accentLight:       string;
  success:           string;
  warning:           string;
  danger:            string;

  // UI elements
  border:            string;
  tabBar:            string;
  tabBarBorder:      string;
  cardShadow:        string;

  // Statuses
  statusNew:         string;
  statusRepeat:      string;
  statusLearned:     string;
}

export const lightColors: ColorScheme = {
  background:        '#f0f0f7',
  backgroundCard:    '#ffffff',
  backgroundInput:   '#f8f8ff',
  backgroundPressed: '#e8e8f0',

  textPrimary:       '#1a1a2e',
  textSecondary:     '#555566',
  textMuted:         '#aaaabb',
  textInverted:      '#ffffff',

  accent:            '#6c63ff',
  accentLight:       'rgba(108, 99, 255, 0.12)',
  success:           '#34c759',
  warning:           '#ff9f43',
  danger:            '#ff3b30',

  border:            '#f0f0f7',
  tabBar:            '#ffffff',
  tabBarBorder:      '#f0f0f7',
  cardShadow:        'rgba(0, 0, 0, 0.08)',

  statusNew:         '#6c63ff',
  statusRepeat:      '#ff9f43',
  statusLearned:     '#34c759',
};

export const darkColors: ColorScheme = {
  background:        '#0f0f1a',
  backgroundCard:    '#1a1a2e',
  backgroundInput:   '#242438',
  backgroundPressed: '#2a2a40',

  textPrimary:       '#f0f0ff',
  textSecondary:     '#aaaacc',
  textMuted:         '#666688',
  textInverted:      '#1a1a2e',

  accent:            '#7c74ff',
  accentLight:       'rgba(124, 116, 255, 0.15)',
  success:           '#30d158',
  warning:           '#ffa040',
  danger:            '#ff453a',

  border:            '#2a2a40',
  tabBar:            '#1a1a2e',
  tabBarBorder:      '#2a2a40',
  cardShadow:        'rgba(0, 0, 0, 0.4)',

  statusNew:         '#7c74ff',
  statusRepeat:      '#ffa040',
  statusLearned:     '#30d158',
};