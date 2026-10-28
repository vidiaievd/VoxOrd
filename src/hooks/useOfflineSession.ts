import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';

/**
 * A cold start is offline until the server confirms the session, which online takes a moment.
 * Anything that announces the offline session waits this long so that moment does not flash
 * it on every start.
 */
const SHOW_AFTER_MS = 2000;

/** True once the app has been working from the stored session, without the server, for a while. */
export function useOfflineSessionVisible(): boolean {
  const { status, offline } = useAuth();
  const offlineSession = status === 'signedIn' && offline;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!offlineSession) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [offlineSession]);

  return visible;
}
