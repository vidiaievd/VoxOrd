import { useCallback, useEffect, useRef, useState } from 'react';
import Sound from 'react-native-sound';
import { getMediaAsset } from '../api/media';

export type NarrationStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

/** The speeds a learner cycles through — slower for a text read at the edge of their level. */
export const NARRATION_SPEEDS = [1, 0.75] as const;

/** How often the position is read while playing — `react-native-sound` has no time events. */
const POLL_MS = 500;

export interface NarrationController {
  status: NarrationStatus;
  /** Seconds into the clip. */
  position: number;
  /** Seconds in the clip, once it has loaded; 0 before. */
  duration: number;
  speed: number;
  toggle: () => void;
  /** Jump by `seconds`, back or forward, inside the clip. */
  seekBy: (seconds: number) => void;
  cycleSpeed: () => void;
}

/**
 * A lesson's narration: play and pause, a jump back or forward, a slower speed.
 *
 * Its own hook rather than `useAudioPlayer`, which plays a clip through and has no position,
 * and rather than `useExerciseAudio`, which is the exercise's listening model — allowances,
 * a gate, segments — and nothing a text read for pleasure needs.
 *
 * The asset URL is signed for an hour (src/api/media.ts), so it is fetched when playback
 * starts, never kept with the lesson.
 */
export function useNarration(mediaId: string | null): NarrationController {
  const [status, setStatus] = useState<NarrationStatus>('idle');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(NARRATION_SPEEDS[0]);
  const soundRef = useRef<Sound | null>(null);
  const mounted = useRef(true);
  /**
   * The speed to play at, read when playback starts. Applied to a playing clip only: on
   * Android `setSpeed` on a paused player starts it playing.
   */
  const speedRef = useRef<number>(NARRATION_SPEEDS[0]);
  const playingRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      soundRef.current?.release();
      soundRef.current = null;
    };
  }, [mediaId]);

  const play = useCallback((sound: Sound) => {
    setStatus('playing');
    playingRef.current = true;
    sound.play(success => {
      playingRef.current = false;
      if (!mounted.current) return;
      if (!success) {
        setStatus('error');
        return;
      }
      // Played to the end: back to the start, ready to be heard again.
      sound.setCurrentTime(0);
      setPosition(0);
      setStatus('idle');
    });
    sound.setSpeed(speedRef.current);
  }, []);

  const toggle = useCallback(() => {
    if (!mediaId || status === 'loading') return;
    const sound = soundRef.current;
    if (sound) {
      if (status === 'playing') {
        sound.pause();
        playingRef.current = false;
        setStatus('paused');
      } else {
        play(sound);
      }
      return;
    }

    setStatus('loading');
    (async () => {
      try {
        const asset = await getMediaAsset(mediaId);
        if (!mounted.current) return;
        const loaded = new Sound(asset.url, undefined, loadError => {
          if (!mounted.current) return;
          if (loadError) {
            setStatus('error');
            return;
          }
          soundRef.current = loaded;
          setDuration(loaded.getDuration());
          play(loaded);
        });
      } catch {
        if (mounted.current) setStatus('error');
      }
    })();
  }, [mediaId, play, status]);

  useEffect(() => {
    if (status !== 'playing') return;
    const timer = setInterval(() => {
      soundRef.current?.getCurrentTime(seconds => {
        if (mounted.current) setPosition(seconds);
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status]);

  const seekBy = useCallback(
    (seconds: number) => {
      const sound = soundRef.current;
      if (!sound) return;
      sound.getCurrentTime(current => {
        const to = Math.min(Math.max(0, current + seconds), duration || current + seconds);
        sound.setCurrentTime(to);
        if (mounted.current) setPosition(to);
      });
    },
    [duration],
  );

  const cycleSpeed = useCallback(() => {
    const at = NARRATION_SPEEDS.indexOf(speedRef.current as (typeof NARRATION_SPEEDS)[number]);
    const next = NARRATION_SPEEDS[(at + 1) % NARRATION_SPEEDS.length] ?? 1;
    speedRef.current = next;
    setSpeed(next);
    if (playingRef.current) soundRef.current?.setSpeed(next);
  }, []);

  return { status, position, duration, speed, toggle, seekBy, cycleSpeed };
}

/**
 * Which of a lesson's media is its narration: the first audio among them.
 *
 * The reader's `mediaIds` carry no type, and a text can hold pictures beside its recording,
 * so each is asked for until one turns out to be audio. `null` while asking, when there is
 * none, and when the asking fails — offline, the reader is the text alone.
 */
export function useNarrationId(mediaIds: readonly string[]): string | null {
  const [found, setFound] = useState<string | null>(null);
  const key = mediaIds.join(',');

  useEffect(() => {
    let cancelled = false;
    setFound(null);
    (async () => {
      for (const id of key === '' ? [] : key.split(',')) {
        try {
          const asset = await getMediaAsset(id);
          if (cancelled) return;
          if (asset.mimeType.startsWith('audio/')) {
            setFound(id);
            return;
          }
        } catch {
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return found;
}
