import * as Keychain from 'react-native-keychain';
import { biometricStore } from '../store/biometricStore';
import { translate } from '../i18n';

/**
 * Secure storage for the refresh token only.
 *
 * The access token is deliberately NOT persisted — it is short-lived and kept
 * in memory by authService. On a cold start we exchange the refresh token for
 * a fresh access token instead of restoring a possibly-expired one.
 *
 * With biometric sign-in on, the token is kept in RSA storage behind the
 * fingerprint or the device PIN. RSA rather than AES-GCM because the token is
 * rewritten on every refresh: RSA encrypts with the public key and asks for the
 * finger only to decrypt, where AES-GCM would ask on every write. The token is a
 * base64 of 64 bytes (auth-service `GenerateRefreshToken`), well inside what one
 * RSA block holds.
 */

const REFRESH_TOKEN_SERVICE = 'com.voxord.platform.refreshToken';

// Keychain stores a username/password pair; we only need the secret, so the
// username is a fixed placeholder.
const ACCOUNT = 'platform';

/**
 * The token once read or written in this run of the app. Without it every refresh would
 * read the Keychain again — with biometric sign-in on, a fingerprint prompt each time.
 */
let cached: string | null = null;

/** The stored session is behind the fingerprint, and the learner did not unlock it. */
export class BiometricLockedError extends Error {
  constructor() {
    super('The stored session is locked behind biometric authentication');
    this.name = 'BiometricLockedError';
  }
}

export async function saveRefreshToken(token: string): Promise<void> {
  cached = token;
  await Keychain.setGenericPassword(ACCOUNT, token, {
    service: REFRESH_TOKEN_SERVICE,
    ...(biometricStore.isEnabled()
      ? {
          storage: Keychain.STORAGE_TYPE.RSA,
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
        }
      : {}),
  });
}

/**
 * The stored token, or null when there is none. Throws `BiometricLockedError` when biometric
 * sign-in is on and the read failed — the prompt was cancelled, or the finger not accepted —
 * so the caller can offer «unlock» instead of treating the session as gone.
 */
export async function loadRefreshToken(): Promise<string | null> {
  if (cached !== null) return cached;
  try {
    const credentials = await Keychain.getGenericPassword({
      service: REFRESH_TOKEN_SERVICE,
      authenticationPrompt: {
        title: translate('auth.biometric.promptTitle'),
        cancel: translate('common.cancel'),
      },
    });
    cached = credentials ? credentials.password : null;
    return cached;
  } catch (e) {
    if (biometricStore.isEnabled()) throw new BiometricLockedError();
    // A corrupted or inaccessible keychain entry must not brick app start —
    // treat it as "no stored session" and let the user sign in again.
    console.warn('[Auth] Failed to read refresh token:', e);
    return null;
  }
}

/**
 * Write the token held in memory again, under the current biometric setting — what turning
 * biometric sign-in on or off does to a session already stored. False when there is no
 * session in memory to write.
 */
export async function rewriteRefreshToken(): Promise<boolean> {
  const token = cached;
  if (token === null) return false;
  try {
    await Keychain.resetGenericPassword({ service: REFRESH_TOKEN_SERVICE });
  } catch (e) {
    console.warn('[Auth] Failed to clear refresh token before rewrite:', e);
  }
  await saveRefreshToken(token);
  return true;
}

export async function clearRefreshToken(): Promise<void> {
  cached = null;
  try {
    await Keychain.resetGenericPassword({ service: REFRESH_TOKEN_SERVICE });
  } catch (e) {
    console.warn('[Auth] Failed to clear refresh token:', e);
  }
}

/** Tests only: forget the token held in memory, as a fresh start of the app would. */
export function __resetRefreshTokenCache(): void {
  cached = null;
}
