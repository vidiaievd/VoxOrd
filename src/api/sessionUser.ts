import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import type { AuthUser } from '../store/authStore';

/**
 * Who the stored session belongs to — what lets the app open without the server.
 *
 * The identity normally comes from the access token's claims, and the access token comes from
 * the server. Without a connection there is none, so the user of the last session is kept here
 * next to the refresh token in the Keychain: a stored token plus this user is a session the app
 * can carry on with until the server is back. Not a secret — the id, email and roles the token
 * carries anyway — so plain storage rather than the Keychain.
 *
 * Written on every sign-in and refresh, dropped together with the refresh token.
 */
const storage = createAsyncStorage('voxord_session_user');
const KEY = 'user';

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    (v.email === null || typeof v.email === 'string') &&
    Array.isArray(v.roles) &&
    v.roles.every(r => typeof r === 'string')
  );
}

export async function saveSessionUser(user: AuthUser): Promise<void> {
  try {
    await storage.setItem(KEY, JSON.stringify(user));
  } catch (e) {
    // Only the offline start depends on it; online the token says who the user is.
    console.warn('[Auth] Failed to store the session user:', e);
  }
}

/** The user of the stored session, or null when none is kept or it cannot be read. */
export async function loadSessionUser(): Promise<AuthUser | null> {
  try {
    const raw = await storage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAuthUser(parsed) ? parsed : null;
  } catch (e) {
    console.warn('[Auth] Failed to read the session user:', e);
    return null;
  }
}

export async function clearSessionUser(): Promise<void> {
  try {
    await storage.removeItem(KEY);
  } catch (e) {
    console.warn('[Auth] Failed to clear the session user:', e);
  }
}
