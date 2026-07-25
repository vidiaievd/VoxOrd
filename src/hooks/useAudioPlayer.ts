import { useCallback, useEffect, useRef, useState } from 'react';
import Sound from 'react-native-sound';
import { getMediaAsset } from '../api/media';

Sound.setCategory('Playback');

export type AudioPlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface AudioPlayerController {
  status: AudioPlayerStatus;
  error: Error | null;
  toggle: () => void;
}

/**
 * Foreground-only narration/listening-stage playback (Phase 7) — no
 * lock-screen or background media session, per the confirmed MVP scope.
 * Resolves the playback URL just-in-time via `getMediaAsset` on first play
 * rather than upfront, since private-asset URLs are pre-signed with a 1h TTL
 * (see src/api/media.ts) and must not be treated as long-lived. One `Sound`
 * instance per `mediaId`, released on unmount or when `mediaId` changes.
 */
export function useAudioPlayer(mediaId: string | null): AudioPlayerController {
  const [status, setStatus] = useState<AudioPlayerStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      soundRef.current?.release();
      soundRef.current = null;
    };
  }, [mediaId]);

  const toggle = useCallback(() => {
    if (!mediaId) return;

    if (soundRef.current) {
      const sound = soundRef.current;
      if (status === 'playing') {
        sound.pause();
        setStatus('paused');
      } else {
        setStatus('playing');
        sound.play((success) => {
          if (mounted.current) setStatus(success ? 'idle' : 'error');
        });
      }
      return;
    }

    setStatus('loading');
    setError(null);
    (async () => {
      try {
        const asset = await getMediaAsset(mediaId);
        if (!mounted.current) return;
        const sound = new Sound(asset.url, undefined, (loadError) => {
          if (!mounted.current) return;
          if (loadError) {
            setStatus('error');
            setError(new Error(loadError.message ?? 'Failed to load audio'));
            return;
          }
          soundRef.current = sound;
          setStatus('playing');
          sound.play((success) => {
            if (mounted.current) setStatus(success ? 'idle' : 'error');
          });
        });
      } catch (e) {
        if (!mounted.current) return;
        setStatus('error');
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  }, [mediaId, status]);

  return { status, error, toggle };
}
