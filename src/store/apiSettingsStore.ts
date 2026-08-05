import { createAsyncStorage } from '@react-native-async-storage/async-storage';

// Android emulator maps 10.0.2.2 to the host machine's localhost, where the
// dev docker-compose gateway (nginx) publishes port 80.
const DEFAULT_BASE_URL = 'http://10.0.2.2:80';

export interface ApiSettings {
  baseUrl: string;
}

const DEFAULT_API_SETTINGS: ApiSettings = {
  baseUrl: DEFAULT_BASE_URL,
};

const storage = createAsyncStorage('voxord_api_settings');

class ApiSettingsStore {
  private settings: ApiSettings = { ...DEFAULT_API_SETTINGS };
  private listeners: Set<() => void> = new Set();

  async load(): Promise<void> {
    try {
      const raw = await storage.getItem('apiSettings');
      if (raw) {
        this.settings = { ...DEFAULT_API_SETTINGS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[ApiSettings] Failed to load:', e);
    }
  }

  async save(): Promise<void> {
    try {
      await storage.setItem('apiSettings', JSON.stringify(this.settings));
      this.notify();
    } catch (e) {
      console.warn('[ApiSettings] Failed to save:', e);
    }
  }

  get<K extends keyof ApiSettings>(key: K): ApiSettings[K] {
    return this.settings[key];
  }

  async set<K extends keyof ApiSettings>(
    key: K,
    value: ApiSettings[K],
  ): Promise<void> {
    this.settings[key] = value;
    await this.save();
  }

  getAll(): ApiSettings {
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

export const apiSettingsStore = new ApiSettingsStore();
