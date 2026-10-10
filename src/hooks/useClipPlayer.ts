import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Sound from 'react-native-sound';

Sound.setCategory('Playback');

/**
 * The one-word clip player of `minimal_pairs` — plan 72, phase 9.
 *
 * The web runner's `minimal-pairs-clips.ts`, over `react-native-sound`: play one clip, play a few
 * back to back with a pause between, stop, and «which one is sounding now» — and the rule that
 * one surface has one engine: starting a clip silences whatever was playing.
 *
 * The audio layer's player (scrubber, play budget, transcript) is not used: a probe is 700 ms
 * with no inside to seek to. The listen budget is not here either. It is the sitting's, because
 * only the sitting knows which press is the probe's own clip and which is a replay the budget does
 * not cover — this player only reports whether a clip actually started.
 *
 * A port, so that a test can stand in for the native module and so that a clip that cannot be
 * loaded is an answer (`'refused'`) rather than an exception: the sitting spends no listen on it.
 */

/** One clip to play. `id` is what `playing(id)` answers to: a word, or the probe itself. */
export interface Clip {
  id: string;
  url: string;
}

/** Whether a clip actually started. `'refused'` — it could not be loaded or there was no file. */
export type PlayOutcome = 'played' | 'refused';

export interface ClipPlayer {
  /** Play one clip, silencing whatever was playing. Resolves once it has started or failed to. */
  play(clip: Clip): Promise<PlayOutcome>;
  /**
   * Play clips back to back, `SEQUENCE_GAP_MS` apart — the A/B comparison and «Hør paret».
   * Resolves with how the first one went; a later one that fails is skipped.
   */
  sequence(clips: Clip[]): Promise<PlayOutcome>;
  stop(): void;
  /** The id of the clip sounding now, or `null`. */
  current(): string | null;
  subscribe(listener: () => void): () => void;
}

/** The pause between two clips of a sequence — the web runner's 420 ms. */
export const SEQUENCE_GAP_MS = 420;

/** What one native `Sound` is asked to do — narrow enough for a test to stand in. */
export interface SoundHandle {
  play(onEnd: (success: boolean) => void): void;
  stop(): void;
  release(): void;
}

export type SoundFactory = (url: string, onLoad: (error: Error | null) => void) => SoundHandle;

const nativeSound: SoundFactory = (url, onLoad) => {
  const sound: Sound = new Sound(url, undefined, error => {
    onLoad(error ? new Error(error.message ?? 'Failed to load audio') : null);
  });
  return {
    play: onEnd => sound.play(onEnd),
    stop: () => sound.stop(),
    release: () => sound.release(),
  };
};

export function createClipPlayer(makeSound: SoundFactory = nativeSound): ClipPlayer {
  const listeners = new Set<() => void>();
  let now: string | null = null;
  /** Bumped by every play, sequence and stop: a callback from an older run is ignored. */
  let run = 0;
  let sound: SoundHandle | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const set = (id: string | null) => {
    if (now === id) return;
    now = id;
    listeners.forEach(l => l());
  };
  const halt = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (sound !== null) {
      sound.stop();
      sound.release();
      sound = null;
    }
  };

  function start(list: Clip[]): Promise<PlayOutcome> {
    halt();
    const mine = ++run;
    const playable = list.filter(c => c.url !== '');
    if (playable.length === 0) {
      set(null);
      return Promise.resolve('refused');
    }

    return new Promise<PlayOutcome>(resolve => {
      let settled = false;
      const settle = (outcome: PlayOutcome) => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };

      const step = (i: number) => {
        if (mine !== run) return;
        const clip = playable[i];
        if (clip === undefined) {
          halt();
          set(null);
          return;
        }
        let over = false;
        /** This clip is over: on to the next of the sequence, or silence. */
        const done = () => {
          if (over || mine !== run) return;
          over = true;
          if (sound !== null) {
            sound.release();
            sound = null;
          }
          if (i + 1 < playable.length) {
            set(null);
            timer = setTimeout(() => step(i + 1), SEQUENCE_GAP_MS);
          } else {
            set(null);
          }
        };
        /**
         * Unloadable or broken. The first clip failing ends the run — the second half of an A/B
         * with no first half is not a comparison; a later one is skipped.
         */
        const fail = () => {
          if (i > 0) {
            done();
            return;
          }
          settle('refused');
          if (over || mine !== run) return;
          over = true;
          halt();
          set(null);
        };

        // The load callback is asynchronous on the device; a stand-in that calls it at once
        // still finds `handle` assigned, because the callback defers to a microtask.
        let handle: SoundHandle | null = null;
        const loaded = (error: Error | null) => {
          if (over || mine !== run) {
            handle?.release();
            return;
          }
          if (error !== null) {
            fail();
            return;
          }
          set(clip.id);
          if (i === 0) settle('played');
          handle?.play(success => (success ? done() : fail()));
        };
        handle = makeSound(clip.url, error => {
          void Promise.resolve().then(() => loaded(error));
        });
        sound = handle;
      };
      step(0);
    });
  }

  return {
    play: clip => start([clip]),
    sequence: clips => start(clips),
    stop: () => {
      run++;
      halt();
      set(null);
    },
    current: () => now,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The player as a surface reads it: what is sounding, and the three commands. */
export interface Clips {
  /** The id sounding now, or `null`. */
  now: string | null;
  playing: (id: string) => boolean;
  anyPlaying: boolean;
  play: (clip: Clip) => Promise<PlayOutcome>;
  sequence: (clips: Clip[]) => Promise<PlayOutcome>;
  stop: () => void;
}

/**
 * One player per surface, for as long as it is mounted. Silenced on unmount — a clip that
 * outlives its screen is a clip nobody can stop. `player` is for tests.
 */
export function useClipPlayer(player?: ClipPlayer): Clips {
  const [engine] = useState<ClipPlayer>(() => player ?? createClipPlayer());
  const now = useSyncExternalStore(engine.subscribe, engine.current, engine.current);

  useEffect(() => () => engine.stop(), [engine]);

  const play = useCallback((clip: Clip) => engine.play(clip), [engine]);
  const sequence = useCallback((clips: Clip[]) => engine.sequence(clips), [engine]);
  const stop = useCallback(() => engine.stop(), [engine]);

  return {
    now,
    playing: id => now === id,
    anyPlaying: now !== null,
    play,
    sequence,
    stop,
  };
}
