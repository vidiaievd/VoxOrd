import * as Keychain from 'react-native-keychain';

/**
 * Secure storage for the refresh token only.
 *
 * The access token is deliberately NOT persisted — it is short-lived and kept
 * in memory by authService. On a cold start we exchange the refresh token for
 * a fresh access token instead of restoring a possibly-expired one.
 */

const REFRESH_TOKEN_SERVICE = 'com.voxord.platform.refreshToken';

// Keychain stores a username/password pair; we only need the secret, so the
// username is a fixed placeholder.
const ACCOUNT = 'platform';

export async function saveRefreshToken(token: string): Promise<void> {
  await Keychain.setGenericPassword(ACCOUNT, token, {
    service: REFRESH_TOKEN_SERVICE,
  });
}

export async function loadRefreshToken(): Promise<string | null> {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: REFRESH_TOKEN_SERVICE,
    });
    return credentials ? credentials.password : null;
  } catch (e) {
    // A corrupted or inaccessible keychain entry must not brick app start —
    // treat it as "no stored session" and let the user sign in again.
    console.warn('[Auth] Failed to read refresh token:', e);
    return null;
  }
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: REFRESH_TOKEN_SERVICE });
  } catch (e) {
    console.warn('[Auth] Failed to clear refresh token:', e);
  }
}
