import { TrainingMode } from './types';

export const DUMMY_USER = {
  name:      'Dmytro',
  avatar:    '👤',
  streak:    7,
  xp:        1240,
  dailyGoal: 20,
  dailyDone: 14,
};

export const DUMMY_CONTINUE = {
  deckTitle:    'Mat og matlaging',
  deckIcon:     '🍽️',
  progress:     0.7,
  wordsLeft:    6,
  totalWords:   20,
};

export const DUMMY_TRAINING_MODES: TrainingMode[] = [
  { id: 'flashcard',     icon: '🃏', labelKey: 'Flashcards',  color: '#6c63ff' },
  { id: 'listening',     icon: '🎧', labelKey: 'Listening',   color: '#ff9f43' },
  { id: 'spelling',      icon: '✍️', labelKey: 'Spelling',    color: '#34c759' },
  { id: 'quiz',          icon: '⚡', labelKey: 'Quick Quiz',  color: '#ff3b30' },
];

export const DUMMY_STATS = {
  wordsLearned: 240,
  weekActivity: [4, 8, 6, 12, 7, 15, 14], // пн-вс
};

export const DUMMY_TOPICS = [
  { id: 1, title: 'Hverdagsliv',  icon: '🏠', words: 45,  progress: 0.6  },
  { id: 2, title: 'Mat',          icon: '🍽️', words: 30,  progress: 0.7  },
  { id: 3, title: 'Reise',        icon: '✈️', words: 52,  progress: 0.3  },
  { id: 4, title: 'Jobb',         icon: '💼', words: 38,  progress: 0.45 },
  { id: 5, title: 'Teknologi',    icon: '💻', words: 29,  progress: 0.2  },
];