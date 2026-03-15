import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { LanguageCode } from '../db/types';

export type ThemeMode = 'light' | 'dark' | 'system';
export type CardMode = 'flip' | 'pronunciation' | 'writing' | 'test';
export type SpellingHintMode = 'always' | 'after_mistake' | 'never';

export interface AppSettings {
  uiLanguage: LanguageCode;
  learningLanguage: string;
  theme: ThemeMode;
  cardModes: CardMode[];
  cardsPerSession: number;
  showWordForms: boolean;
  showOrdbokenLink: boolean;
  spellingHintMode: SpellingHintMode;
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
