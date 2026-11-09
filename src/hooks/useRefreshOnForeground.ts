import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Runs `refresh` when the app comes back from the background. The navigator holds one screen
 * and remounts it on every arrival, so coming back to a screen already refetches; this covers
 * the one return that remounts nothing — the phone waking with the screen still up.
 */
export function useRefreshOnForeground(refresh: () => Promise<void> | void) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', state => {
      if (last !== 'active' && state === 'active') void latest.current();
      last = state;
    });
    return () => sub.remove();
  }, []);
}
