import { createAsyncStorage } from '@react-native-async-storage/async-storage';

/**
 * Whether the stored session is locked behind the fingerprint (or the device PIN), and
 * whether the learner has been asked yet. Read before the session is written, so it is
 * loaded at app start; the session itself stays in the Keychain (api/tokenStorage).
 */
const storage = createAsyncStorage('voxord_biometric');

interface BiometricFlags {
  enabled: boolean;
  /** The one-time «sign in with your fingerprint?» after a password sign-in was shown. */
  offered: boolean;
}

class BiometricStore {
  private flags: BiometricFlags = { enabled: false, offered: false };

  async load(): Promise<void> {
    try {
      const raw = await storage.getItem('flags');
      if (raw) this.flags = { ...this.flags, ...JSON.parse(raw) };
    } catch (e) {
      console.warn('[Biometric] Failed to load:', e);
    }
  }

  isEnabled(): boolean {
    return this.flags.enabled;
  }

  wasOffered(): boolean {
    return this.flags.offered;
  }

  async set(patch: Partial<BiometricFlags>): Promise<void> {
    this.flags = { ...this.flags, ...patch };
    try {
      await storage.setItem('flags', JSON.stringify(this.flags));
    } catch (e) {
      console.warn('[Biometric] Failed to save:', e);
    }
  }
}

export const biometricStore = new BiometricStore();
