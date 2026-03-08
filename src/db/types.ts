import { open } from '@op-engineering/op-sqlite';

export type DB = ReturnType<typeof open>;

export type LanguageCode = 'no' | 'ru' | 'uk' | 'pl' | 'lt' | 'en';

export const UI_LANGUAGE: LanguageCode = 'ru';

export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';

export type NounGender = 'masculine' | 'feminine' | 'neuter' | null;

export type WordLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// All possible forms of a word
export type FormType =
  // Verbs
  | 'infinitive'
  | 'present'
  | 'past'
  | 'perfect'
  | 'imperative'
  // Nouns
  | 'singular_indefinite'
  | 'singular_definite'
  | 'plural_indefinite'
  | 'plural_definite'
  // Adjectives
  | 'masculine'
  | 'feminine'
  | 'neuter'
  | 'plural'
  | 'comparative'
  | 'superlative'
  // Adverbs and phrases
  | 'base';

export interface WordForm {
  formType: FormType;
  form: string;
}

export type DeckUserStatus = 'new' | 'in_progress' | 'completed';

export interface UserProfile {
  id:        number;
  name:      string;
  avatar:    string;
  createdAt: number;
}

export interface UserStats {
  id:                number;
  xp:                number;
  streak:            number;
  longestStreak:     number;
  lastActivityAt:    number | null;
  totalWordsLearned: number;
  totalSessions:     number;
}

export interface DailyActivity {
  id:            number;
  date:          string; // 'YYYY-MM-DD'
  wordsStudied:  number;
  xpEarned:      number;
  sessionsCount: number;
}

export interface DailyGoal {
  id:        number;
  goal:      number;
  updatedAt: number;
}

export const TABLE = {
  WORDS:              'words',
  WORD_FORMS:         'word_forms',
  TRANSLATIONS:       'translations',
  DECK_GROUPS:        'deck_groups',
  DECKS:              'decks',
  DECK_WORDS:         'deck_words',
  WORD_PROGRESS:      'word_progress',
  DECK_USER_SETTINGS: 'deck_user_settings',
  USER_PROFILE:       'user_profile',
  USER_STATS:         'user_stats',
  DAILY_ACTIVITY:     'daily_activity',
  DAILY_GOAL:         'daily_goal',
} as const;
