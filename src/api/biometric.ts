import * as Keychain from 'react-native-keychain';
import { biometricStore } from '../store/biometricStore';
import { rewriteRefreshToken } from './tokenStorage';

/** Whether the device can lock the session behind a fingerprint, a face, or an iris. */
export async function biometryAvailable(): Promise<boolean> {
  try {
    return (await Keychain.getSupportedBiometryType()) !== null;
  } catch {
    return false;
  }
}

/**
 * Turn biometric sign-in on or off, moving the stored session into or out of the
 * fingerprint-locked storage. False when there is no session in memory to move — the flag
 * is then left as it was.
 */
export async function setBiometricSignIn(enabled: boolean): Promise<boolean> {
  const previous = biometricStore.isEnabled();
  await biometricStore.set({ enabled, offered: true });
  try {
    if (await rewriteRefreshToken()) return true;
  } catch (e) {
    console.warn('[Biometric] Failed to move the session:', e);
  }
  await biometricStore.set({ enabled: previous });
  return false;
}
