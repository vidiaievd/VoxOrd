import { useState, useEffect, useCallback } from 'react';
import { sessionRepository } from '../repositories/SessionRepository';

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export interface DeepSessionCooldown {
  isOnCooldown: boolean;
  remainingMs: number;
  remainingLabel: string; // e.g. "3h 42m"
  isLoading: boolean;
  refresh: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function useDeepSessionCooldown(deckId: number): DeepSessionCooldown {
  const [isLoading, setIsLoading] = useState(true);
  const [remainingMs, setRemainingMs] = useState(0);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const lastFinishedAt = await sessionRepository.getLastDeepSession(deckId);
      if (!cancelled) {
        if (lastFinishedAt === null) {
          setRemainingMs(0);
        } else {
          const elapsed = Date.now() - lastFinishedAt;
          const remaining = Math.max(0, COOLDOWN_MS - elapsed);
          setRemainingMs(remaining);
        }
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, tick]);

  // Tick every minute to update label
  useEffect(() => {
    if (remainingMs <= 0) return;
    const interval = setInterval(() => {
      setRemainingMs(prev => {
        const next = Math.max(0, prev - 60000);
        return next;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [remainingMs]);

  return {
    isOnCooldown: remainingMs > 0,
    remainingMs,
    remainingLabel: formatRemaining(remainingMs),
    isLoading,
    refresh,
  };
}
