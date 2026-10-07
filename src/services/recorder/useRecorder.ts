import { useEffect, useReducer, useRef, useState } from 'react';
import {
  initialState,
  nextTakeNumber,
  reduce,
  takesOf,
  ticking,
  type Draft,
  type RecorderConfig,
  type RecorderEvent,
  type RecorderState,
} from '../../lib/readAloud';
import { flatLevels, type Capture, type RecorderPort } from './port';

/** How often the meter and the level check read the microphone — the prototype's 90 ms. */
export const LEVEL_MS = 90;

/** A take the hardware has just handed over, with where it belongs. */
export interface CapturedTake extends Capture {
  itemId: string;
  /** The take's number at its prompt — the kernel's `Take.n`. */
  n: number;
}

export interface UseRecorderOptions {
  config: RecorderConfig;
  /** The microphone. `null` draws the recorder and never opens anything. */
  port: RecorderPort | null;
  /** Called once per finished take, after the kernel has it. The runner uploads from here. */
  onCaptured?: (take: CapturedTake) => void;
  /** Takes already uploaded on this attempt, back from its draft — applied once (RA-R10). */
  initialDraft?: Draft | null;
}

export interface RecorderHandle {
  state: RecorderState;
  /** What the meter shows now: live levels while listening, flat otherwise. */
  levels: number[];
  ready: () => void;
  /** «Start opptak» / «Ta opp på nytt». Asks for the microphone first if it has not been. */
  begin: () => void;
  startNow: () => void;
  stop: () => void;
  choose: (index: number) => void;
  goto: (index: number) => void;
  retryMic: () => void;
  restore: (draft: Draft) => void;
  uploaded: (itemId: string, n: number, assetId: string) => void;
  uploadFailed: (itemId: string, n: number) => void;
  uploadRetry: (itemId: string, n: number) => void;
  /** The server refused this take at hand-in: it goes, and the slot comes back. */
  refused: (itemId: string, n: number) => void;
}

/**
 * The phone's half of the recorder — the web's `useRecorder` (plan 70 §3.3, phase 6.1) over the
 * same kernel machine, with the Android port under it.
 *
 * The kernel's reducer decides everything; this hook keeps time and touches the hardware:
 *
 *   - **time** — one tick a second while a phase that counts is on, restarted per phase;
 *   - **the microphone** — asked for on the level check, or on the first «Start» when there is
 *     none, *before* the preparation: a permission dialog answered while a clock runs would eat
 *     the student's preparation time;
 *   - **the meter** — runs only while the level check is on screen (Android records to listen);
 *   - **a take** — started when the kernel enters `rec`, stopped when it asks (`stopping`), the
 *     file answered back with `stopped`; the native clock gives the length;
 *   - **interruptions** — the port's, passed on; the kernel spends no take on them (§8 item 4).
 */
export function useRecorder({
  config,
  port,
  onCaptured,
  initialDraft = null,
}: UseRecorderOptions): RecorderHandle {
  const [state, dispatch] = useReducer(
    (s: RecorderState, e: RecorderEvent) => reduce(s, e, config),
    config,
    (c: RecorderConfig) =>
      initialDraft === null
        ? initialState(c)
        : reduce(
            initialState(c),
            {
              type: 'restore',
              takes: initialDraft.takes,
              chosen: initialDraft.chosen,
            },
            c,
          ),
  );
  const [micOpen, setMicOpen] = useState(false);
  const [levels, setLevels] = useState<number[]>(flatLevels);

  const captured = useRef(onCaptured);
  useEffect(() => {
    captured.current = onCaptured;
  }, [onCaptured]);

  const { phase } = state;
  const prompt = config.prompts[state.index];
  const itemId = prompt?.id ?? null;
  const nextN = itemId === null ? 0 : nextTakeNumber(takesOf(state, itemId));

  // The level check asks for the microphone as soon as it is on screen…
  useEffect(() => {
    if (port === null || phase !== 'mic' || micOpen) return;
    let live = true;
    void port.open().then(result => {
      if (!live) return;
      if (result === 'ok') setMicOpen(true);
      else dispatch({ type: result });
    });
    return () => {
      live = false;
    };
  }, [port, phase, micOpen]);

  // …and listens only while it is.
  useEffect(() => {
    if (port === null || phase !== 'mic' || !micOpen) return;
    port.meter(true);
    return () => port.meter(false);
  }, [port, phase, micOpen]);

  // One tick a second, from the start of each counting phase.
  const tickPhase = ticking(phase) ? phase : null;
  useEffect(() => {
    if (tickPhase === null) return;
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(id);
  }, [tickPhase]);

  // The take starts when the kernel says the microphone is open for it.
  useEffect(() => {
    if (port === null || phase !== 'rec' || !micOpen) return;
    let live = true;
    void port.start().then(result => {
      if (live && result !== 'ok') {
        setMicOpen(false);
        dispatch({ type: result });
      }
    });
    return () => {
      live = false;
    };
  }, [port, phase, micOpen]);

  // …and ends when the kernel asks: the student's «Stopp», the prompt's maximum or 180 s.
  useEffect(() => {
    if (port === null || phase !== 'stopping' || itemId === null) return;
    let live = true;
    void port.stop().then(capture => {
      if (!live) return;
      if (capture === null) {
        // Nothing usable was written — an interruption got there first, or the take was
        // stopped before the encoder wrote anything. Not the student's attempt.
        dispatch({ type: 'interrupted' });
        return;
      }
      dispatch({
        type: 'stopped',
        ref: capture.path,
        ...(Number.isFinite(capture.seconds)
          ? { seconds: capture.seconds }
          : {}),
      });
      captured.current?.({ ...capture, itemId, n: nextN });
    });
    return () => {
      live = false;
    };
  }, [port, phase, itemId, nextN]);

  // The meter, and the level check's ears.
  const listening =
    port !== null && micOpen && (phase === 'mic' || phase === 'rec');
  const checking = phase === 'mic';
  useEffect(() => {
    if (!listening || port === null) return;
    const id = setInterval(() => {
      setLevels(port.levels());
      if (checking)
        dispatch({ type: 'level', value: port.level(), ms: LEVEL_MS });
    }, LEVEL_MS);
    return () => clearInterval(id);
  }, [listening, checking, port]);

  useEffect(() => {
    if (port === null) return;
    return port.onInterrupt(() => {
      port.cancel();
      dispatch({ type: 'interrupted' });
    });
  }, [port]);

  useEffect(() => {
    return () => {
      port?.close();
    };
  }, [port]);

  function begin() {
    if (port === null) return;
    if (port.isOpen()) {
      dispatch({ type: 'begin' });
      return;
    }
    void port.open().then(result => {
      if (result === 'ok') {
        setMicOpen(true);
        dispatch({ type: 'begin' });
      } else {
        dispatch({ type: result });
      }
    });
  }

  return {
    state,
    levels: listening ? levels : flatLevels(),
    ready: () => dispatch({ type: 'ready' }),
    begin,
    startNow: () => dispatch({ type: 'startNow' }),
    stop: () => dispatch({ type: 'stop' }),
    choose: index => dispatch({ type: 'choose', index }),
    goto: index => dispatch({ type: 'goto', index }),
    retryMic: () => dispatch({ type: 'retry' }),
    restore: draft =>
      dispatch({ type: 'restore', takes: draft.takes, chosen: draft.chosen }),
    uploaded: (id, n, assetId) =>
      dispatch({ type: 'uploaded', itemId: id, n, assetId }),
    uploadFailed: (id, n) => dispatch({ type: 'uploadFailed', itemId: id, n }),
    uploadRetry: (id, n) => dispatch({ type: 'uploadRetry', itemId: id, n }),
    refused: (id, n) => dispatch({ type: 'refused', itemId: id, n }),
  };
}
