import { AppState } from 'react-native';
import { getLocales } from 'react-native-localize';
import { settingsStore } from '../store/settingsStore';

let cached: string[] | null = null;

function read(): string[] {
  try {
    return getLocales().map(l => l.languageTag);
  } catch {
    return [];
  }
}

/**
 * The phone's languages in its order of preference, as BCP 47 tags. Read once and kept: the
 * interface resolves its language on every render, and the list only changes while the app
 * is in the background (see `watchDeviceLocales`).
 */
export function deviceLocaleTags(): string[] {
  if (cached === null) cached = read();
  return cached;
}

/**
 * Re-read the phone's languages each time the app comes back to the foreground — the
 * learner may have changed them in the phone's settings meanwhile. When they changed,
 * settings listeners hear it, so a learner on «as on the phone» sees the new language
 * without a restart.
 */
export function watchDeviceLocales(): () => void {
  const subscription = AppState.addEventListener('change', state => {
    if (state !== 'active') return;
    const next = read();
    const before = cached ?? [];
    cached = next;
    if (next.join(',') !== before.join(',')) settingsStore.notify();
  });
  return () => subscription.remove();
}
