import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { LanguageCode } from '../db/types';

export type ThemeMode = 'light' | 'dark' | 'system';
export type CardMode = 'flip' | 'pronunciation' | 'writing' | 'test';
export type SpellingHintMode = 'always' | 'after_mistake' | 'never';

/** The sizes a text can be read at, in points (Courses §8.1). */
export const READER_FONT_SIZES = [15, 17, 20] as const;
export type ReaderFontSize = (typeof READER_FONT_SIZES)[number];

/** `offlineUnitsAhead` meaning the whole course rather than a number of units. */
export const ALL_UNITS = -1;

export interface AppSettings {
  uiLanguage: LanguageCode;
  learningLanguage: string;
  theme: ThemeMode;
  cardModes: CardMode[];
  cardsPerSession: number;
  showWordForms: boolean;
  showOrdbokenLink: boolean;
  spellingHintMode: SpellingHintMode;
  /**
   * Units kept on the phone beyond the one the learner is on (offline plan, B3) — text and
   * media alike. `ALL_UNITS` for the whole course.
   */
  offlineUnitsAhead: number;
  /** Course media may be downloaded over mobile data too, not only Wi-Fi. */
  offlineMediaOnCellular: boolean;
  /** The size of a text in the reader. */
  readerFontSize: ReaderFontSize;
  /** Words are spoken when a card or a word list shows them. */
  autoplayAudio: boolean;
  // Account-level preferences. Kept on the phone until `accountPrefsStore` (plan 07, step 8)
  // gives them a home on the server.
  dailyGoalMin: number;
  /** Language word translations are shown in; `null` follows the interface language. */
  translationLanguage: LanguageCode | null;
  notifReviewReminder: boolean;
  /** «HH:mm», local time. */
  notifReviewReminderTime: string;
  notifWork: boolean;
  notifSchool: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  uiLanguage: 'ru',
  learningLanguage: 'no',
  theme: 'system',
  cardModes: ['flip'],
  cardsPerSession: 20,
  showWordForms: true,
  showOrdbokenLink: true,
  spellingHintMode: 'after_mistake',
  offlineUnitsAhead: 2,
  offlineMediaOnCellular: false,
  readerFontSize: 17,
  autoplayAudio: true,
  dailyGoalMin: 10,
  translationLanguage: null,
  notifReviewReminder: false,
  notifReviewReminderTime: '19:00',
  notifWork: true,
  notifSchool: true,
};

const storage = createAsyncStorage('voxord_settings');

class SettingsStore {
  private settings: AppSettings = { ...DEFAULT_SETTINGS };
  private listeners: Set<() => void> = new Set();

  async load(): Promise<void> {
    try {
      const raw = await storage.getItem('settings');
      if (raw) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[Settings] Failed to load:', e);
    }
  }

  async save(): Promise<void> {
    try {
      await storage.setItem('settings', JSON.stringify(this.settings));
      this.notify();
    } catch (e) {
      console.warn('[Settings] Failed to save:', e);
    }
  }

  get<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }

  async set<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ): Promise<void> {
    this.settings[key] = value;
    await this.save();
  }

  getAll(): AppSettings {
    return { ...this.settings };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }
}

export const settingsStore = new SettingsStore();
