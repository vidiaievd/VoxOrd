import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Sound from 'react-native-sound';
import { getMediaAsset } from '../api/media';
import {
  audioOf,
  canPlay as canPlayNow,
  deliveredSegments,
  hasHeard,
  INITIAL_STATE,
  isExhausted,
  isGated,
  step,
  type AllowanceContext,
  type AllowanceEvent,
  type AllowanceState,
  type ExerciseAudio,
  type ItemAudio,
  type PlaybackEffect,
} from '../lib/audio';
import { useLessonClip } from './useLessonClip';

/**
 * The phone's half of the playback engine — plan 56 §3.10, phase 7.
 *
 * The rules are not here. They are in `lib/audio/allowance.ts`, mirrored from the kernel
 * the browser and the server also read, and every judgement this hook appears to make —
 * whether a press spends a listen, whether a fragment ends the playthrough, whether the
 * gate opens — is made there. This file is the adapter: it turns what
 * `react-native-sound` can tell us into kernel events, and applies the effect the kernel
 * asks for to a `Sound`.
 *
 * The one thing that differs from the browser is how position is learned.
 * `react-native-sound` has no time events at all — only `getCurrentTime(cb)` — so the
 * position is **polled at 250 ms while playing** (§3.10). The reducer cannot tell the
 * difference: it takes a `time` event and never asks who produced it. The visible cost is
 * that a fragment stops within a quarter of a second of its end, which is a tolerable
 * margin for one line of a dialogue.
 *
 * It is not built on `useAudioPlayer`. That hook plays a lesson's narration, where
 * re-listening is free and unlimited; this one plays an exercise with an allowance, and a
 * press it may have to refuse. Sharing a hook between them would mean one of the two
 * lying about what it is.
 */
export interface ExerciseAudioEngine {
  audio: ExerciseAudio;
  /**
   * Every item's timecode, keyed by item id. Gathered onto the block by the projection
   * rather than left on the items (plan 56 §3.3), so a body looks one up by the id of
   * the item it is drawing, whatever its template calls its items.
   */
  segments: Record<string, ItemAudio>;
  /** The resolved playback URL, or null while it is being fetched or if there is none. */
  src: string | null;
  state: AllowanceState;
  /** Clip length: the loaded track's own, falling back to the author's stored hint. */
  duration: number;
  playing: boolean;
  /** Listens spent and allowed. `limit === 0` is unlimited. */
  plays: number;
  limit: number;
  exhausted: boolean;
  heard: boolean;
  /** Items are locked: the teacher asked for one full listen and it has not happened. */
  gated: boolean;
  /** The press would do something. False when the next start would be refused. */
  canPlay: boolean;
  /** The clip could not be loaded or decoded. The gate opens when this is true. */
  failed: boolean;
  loading: boolean;
  speed: number;
  toggle: () => void;
  back: () => void;
  seekTo: (seconds: number) => void;
  playRange: (start: number, end: number) => void;
  cycleSpeed: () => void;
  reset: () => void;
}

/** 0.75 / 1 / 1.25 — the handoff's three, not the lesson player's four. */
const SPEEDS = [0.75, 1, 1.25] as const;

/** How often the position is asked for while playing (§3.10). */
const POLL_MS = 250;

export interface UseExerciseAudioOptions {
  /** False pauses playback and refuses input: a body left behind must not keep playing. */
  active?: boolean;
}

/**
 * The state, plus the instruction the `Sound` has not been given yet.
 *
 * `seq` is what makes an instruction happen exactly once: two presses of «−10 s» produce
 * the same effect twice, and an effect keyed on the object alone would apply the second
 * only if it happened to differ from the first.
 */
interface Playback {
  state: AllowanceState;
  effect: PlaybackEffect;
  seq: number;
}

const IDLE: Playback = {
  state: INITIAL_STATE,
  effect: { seekTo: null, transport: null },
  seq: 0,
};

/**
 * The context travels with the event rather than being closed over, so the reducer stays
 * a pure function of what it is given: a `seek` has to be clamped against the length of
 * the clip as it is known *now*, and the caller is the one who knows that.
 */
type PlaybackAction =
  | { type: 'event'; event: AllowanceEvent; ctx: AllowanceContext }
  | { type: 'clear' };

function playbackReducer(current: Playback, action: PlaybackAction): Playback {
  if (action.type === 'clear') {
    return { ...IDLE, seq: current.seq + 1 };
  }
  const next = step(current.state, action.event, action.ctx);
  return { state: next.state, effect: next.effect, seq: current.seq + 1 };
}

export function useExerciseAudio(
  content: unknown,
  { active = true }: UseExerciseAudioOptions = {},
): ExerciseAudioEngine {
  const audio = useMemo(() => audioOf(content), [content]);
  const segments = useMemo(() => deliveredSegments(content), [content]);

  const [playback, dispatch] = useReducer(playbackReducer, IDLE);
  const [src, setSrc] = useState<string | null>(null);
  const [trackDuration, setTrackDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const soundRef = useRef<Sound | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const lessonClip = useLessonClip(audio.source === 'lesson' ? audio.lessonRef : null);

  /*
    A `link` clip is its own URL; an `asset` one is a storage key media-service signs for
    an hour, so it is resolved just before playback rather than stored in the document
    (see `api/media.ts` on the 1 h TTL). An exercise with no audio asks nothing.
  */
  const assetId =
    audio.source === 'asset' ? audio.assetId : audio.source === 'lesson' ? lessonClip ?? '' : '';
  const linkUrl = audio.source === 'link' ? audio.url : '';

  useEffect(() => {
    if (!audio.enabled) {
      setSrc(null);
      return;
    }
    if (linkUrl !== '') {
      setSrc(linkUrl);
      setFailed(false);
      return;
    }
    if (assetId === '') {
      setSrc(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const asset = await getMediaAsset(assetId);
        if (cancelled || !mounted.current) return;
        setSrc(asset.url);
        setFailed(false);
      } catch {
        if (cancelled || !mounted.current) return;
        // Nothing to play is not an exercise that cannot be answered: the gate opens on
        // this and the transcript opens with it (BEHAVIOR §11).
        setFailed(true);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audio.enabled, assetId, linkUrl]);

  /* ── one `Sound` per clip, released when the clip changes or the body goes away ── */
  useEffect(() => {
    if (src === null) return;

    let cancelled = false;
    setLoading(true);
    const sound = new Sound(src, undefined, error => {
      if (cancelled) {
        sound.release();
        return;
      }
      setLoading(false);
      if (error) {
        setFailed(true);
        return;
      }
      soundRef.current = sound;
      const seconds = sound.getDuration();
      setTrackDuration(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    });

    return () => {
      cancelled = true;
      soundRef.current = null;
      sound.release();
    };
  }, [src]);

  const duration = trackDuration > 0 ? trackDuration : audio.duration;
  const ctx: AllowanceContext = useMemo(
    () => ({ settings: audio.settings, duration }),
    [audio.settings, duration],
  );
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const send = useCallback((event: AllowanceEvent) => {
    dispatch({ type: 'event', event, ctx: ctxRef.current });
  }, []);

  /*
    A new clip or a new allowance is a new exercise as far as playback is concerned
    (INTEGRATION.md); a body that has gone away has to fall silent, because a voice must
    never keep coming out of a screen nobody is looking at (BEHAVIOR §11).
  */
  const clip = `${audio.enabled}|${audio.assetId}|${audio.url}|${audio.settings.layout}|${audio.settings.plays}`;
  useEffect(() => {
    dispatch({ type: 'clear' });
  }, [clip]);

  useEffect(() => {
    if (!active) send({ type: 'pause' });
  }, [active, send]);

  /* ── the kernel's instruction, carried out on the track ── */
  useEffect(() => {
    const sound = soundRef.current;
    if (!sound) return;

    if (playback.effect.seekTo !== null) sound.setCurrentTime(playback.effect.seekTo);
    if (playback.effect.transport === 'pause') sound.pause();
    if (playback.effect.transport === 'play') {
      // The callback fires when the track finishes or fails, never on a pause — so this
      // is `ended`, and a failure is a clip that could not be decoded.
      sound.play(success => {
        if (!mounted.current) return;
        if (success) send({ type: 'ended' });
        else setFailed(true);
      });
    }
    // Applied once per transition, which is what `seq` counts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.seq]);

  /* ── position, polled: `react-native-sound` has no time events (§3.10) ── */
  useEffect(() => {
    if (!playback.state.playing) return;

    const timer = setInterval(() => {
      const sound = soundRef.current;
      if (!sound) return;
      sound.getCurrentTime(seconds => {
        if (mounted.current) send({ type: 'time', pos: seconds });
      });
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [playback.state.playing, send]);

  useEffect(() => {
    soundRef.current?.setSpeed(speed);
  }, [speed, src]);

  const state = playback.state;
  const unplayable = failed || (src === null && audio.enabled);

  return {
    audio,
    segments,
    src,
    state,
    duration,
    playing: state.playing,
    plays: state.plays,
    limit: audio.settings.plays,
    exhausted: isExhausted(state, audio.settings),
    heard: hasHeard(state),
    gated: isGated(state, audio.settings, { playable: !unplayable }),
    /*
      `loading` refuses the press as well, which the browser does not have to do: there
      the element exists from the first render and a press queues against it, while here
      the `Sound` is built asynchronously and a press before it lands would spend a listen
      on silence.
    */
    canPlay: canPlayNow(state, ctx, { interactive: active && !unplayable && !loading }),
    failed: unplayable,
    loading,
    speed,
    toggle: () => {
      if (active) send({ type: state.playing ? 'pause' : 'play' });
    },
    back: () => send({ type: 'seek', to: state.pos - 10 }),
    seekTo: (seconds: number) => send({ type: 'seek', to: seconds }),
    playRange: (start: number, end: number) => send({ type: 'playRange', start, end }),
    cycleSpeed: () =>
      setSpeed(current => SPEEDS[(SPEEDS.indexOf(current as 0.75) + 1) % SPEEDS.length] ?? 1),
    reset: () => send({ type: 'reset' }),
  };
}
