import { useCallback, useRef, useState } from 'react';
import { deleteMediaAsset, fetchMediaAsset, uploadRecording } from '../api/media';
import {
  getSoundSessionItems,
  postSoundTake,
  soundRefusal,
  startSoundSession,
  submitSoundSession,
  type ReferenceClip,
  type SessionBudget,
  type SessionResult,
  type SoundInstruction,
  type SoundRefusal,
  type SoundSession,
  type TakeResult,
} from '../api/soundSession';
import type { Capture } from '../services/recorder';

/**
 * Where the learner is in a pronunciation session (platform plan 86, VoxOrd step 15.2) — the web's
 * `useSoundSession`, on a phone. The engine holds the truth (step, takes, ratings); this only walks
 * its answers: start → look at the step → say it → see the verdict → next step … → hand in.
 *
 *  idle        nothing begun
 *  starting    asking for a session
 *  refused     the door said no (`refusal.code`: SESSION_LIMIT, POOL_EMPTY, NOT_AVAILABLE, …)
 *  step        a step to say, with its clips and the base's instruction
 *  sending     a take is on its way and being heard
 *  verdict     the last take's answer is on screen; `next()` moves on
 *  ending      the session is over (done, or stopped by the payer); `finish()` hands it in
 *  submitting  the hand-in is on its way
 *  result      handed in; the ratings are in `result`
 *  broken      something is not right; `reload()` asks the engine where we are
 */
export type SoundSessionPhase =
  | 'idle'
  | 'starting'
  | 'refused'
  | 'step'
  | 'sending'
  | 'verdict'
  | 'ending'
  | 'submitting'
  | 'result'
  | 'broken';

/** Why a take was not heard, as the screen says it. */
export type TakeNotice = 'uploadFailed' | 'notReady' | 'inaudible' | 'tryAgain' | 'stale';

export interface SoundSessionState {
  phase: SoundSessionPhase;
  session: SoundSession | null;
  budget: SessionBudget | null;
  clips: ReferenceClip[];
  instruction: SoundInstruction | null;
  /** The take the verdict screen is about. */
  take: TakeResult | null;
  /** A take that did not count; the same step is still in front of the learner. */
  notice: TakeNotice | null;
  refusal: SoundRefusal | null;
  result: SessionResult | null;
}

const INITIAL: SoundSessionState = {
  phase: 'idle',
  session: null,
  budget: null,
  clips: [],
  instruction: null,
  take: null,
  notice: null,
  refusal: null,
  result: null,
};

/** The calls the hook makes; tests swap them. */
export interface SoundSessionApi {
  start: typeof startSoundSession;
  items: typeof getSoundSessionItems;
  take: typeof postSoundTake;
  submit: typeof submitSoundSession;
  /** Waits until media-service has made the speech variant of an upload; never throws. */
  settle: (assetId: string) => Promise<void>;
  upload: (input: { capture: Capture; attemptId: string; filename: string }) => Promise<{ assetId: string }>;
  discard: (assetId: string) => Promise<void>;
}

/** media-service makes the speech variant after finalize; a take heard before it is `not_ready`. */
const READY_POLL_MS = 700;
const READY_POLLS = 30;
const SETTLED = new Set(['READY', 'FAILED', 'DELETED']);

async function waitUntilProcessed(assetId: string): Promise<void> {
  for (let i = 0; i < READY_POLLS; i++) {
    try {
      const asset = await fetchMediaAsset(assetId);
      if (asset.status === undefined || SETTLED.has(asset.status)) return;
    } catch {
      return;
    }
    await new Promise<void>(resolve => setTimeout(resolve, READY_POLL_MS));
  }
}

const defaultApi: SoundSessionApi = {
  start: startSoundSession,
  items: getSoundSessionItems,
  take: postSoundTake,
  submit: submitSoundSession,
  settle: waitUntilProcessed,
  upload: ({ capture, attemptId, filename }) =>
    uploadRecording({
      path: capture.path,
      mimeType: capture.mimeType,
      size: capture.size,
      attemptId,
      filename,
    }),
  discard: deleteMediaAsset,
};

function extensionOf(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'm4a';
}

const NOTICE_OF: Record<string, TakeNotice> = {
  recording_not_ready: 'notReady',
  recording_inaudible: 'inaudible',
};

/** A fault that is not the engine's refusal (network, unreadable answer) still needs a shape. */
function refusalOf(e: unknown): SoundRefusal {
  return (
    soundRefusal(e) ?? { status: 502, code: 'UNREADABLE', retryAfterMs: null, takeIndex: null }
  );
}

export interface UseSoundSessionOptions {
  /** The language to learn (`nb`). */
  language: string;
  /** The app's language: the interface and the explanations. */
  locale: string;
  api?: SoundSessionApi;
}

export function useSoundSession({ language, locale, api = defaultApi }: UseSoundSessionOptions) {
  const [state, setState] = useState<SoundSessionState>(INITIAL);
  const busy = useRef(false);

  const patch = useCallback(
    (p: Partial<SoundSessionState>) => setState(s => ({ ...s, ...p })),
    [],
  );

  /** Fetch the step's clips and instruction; the session in hand is already known. */
  const showStep = useCallback(
    async (attemptId: string, extra: Partial<SoundSessionState> = {}) => {
      try {
        const { session, clips, instruction } = await api.items(attemptId, locale);
        patch({
          session,
          clips,
          instruction,
          phase: session.phase === 'done' ? 'ending' : 'step',
          ...extra,
        });
      } catch (e) {
        patch({ phase: 'broken', ...extra, refusal: refusalOf(e) });
      }
    },
    [api, locale, patch],
  );

  /** Begin a session (or pick up the open one); `atomId` — the learner chose a sound. */
  const start = useCallback(
    async (atomId?: string) => {
      if (busy.current) return;
      busy.current = true;
      setState({ ...INITIAL, phase: 'starting' });
      try {
        let started: Awaited<ReturnType<SoundSessionApi['start']>>;
        try {
          started = await api.start(language, atomId);
        } catch (e) {
          patch({ phase: 'refused', refusal: refusalOf(e) });
          return;
        }
        const { session, budget } = started;
        patch({ session, budget });
        if (session.phase === 'done') {
          patch({ phase: 'ending' });
          return;
        }
        await showStep(session.attemptId, { budget });
      } finally {
        busy.current = false;
      }
    },
    [api, language, patch, showStep],
  );

  /** Say the step: upload the take, have it heard, show the verdict. */
  const sendTake = useCallback(
    async (capture: Capture) => {
      const session = state.session;
      if (busy.current || session === null || state.phase !== 'step') return;
      busy.current = true;
      patch({ phase: 'sending', notice: null });
      let assetId: string | null = null;
      try {
        try {
          ({ assetId } = await api.upload({
            capture,
            attemptId: session.attemptId,
            filename: `take-${session.takeIndex}.${extensionOf(capture.mimeType)}`,
          }));
        } catch {
          patch({ phase: 'step', notice: 'uploadFailed' });
          return;
        }
        // A try that meets «not ready» still costs the sentence's daily try: wait for the variant.
        await api.settle(assetId);

        let take: TakeResult;
        try {
          take = await api.take(session.attemptId, {
            recordingAssetId: assetId,
            takeIndex: session.takeIndex,
            explanationLanguage: locale,
          });
        } catch (e) {
          const refusal = refusalOf(e);
          if (refusal.status === 409 && refusal.code === 'STALE_TAKE') {
            // Another device (or a double send) moved the session: look again, nothing is lost.
            await showStep(session.attemptId, { notice: 'stale' });
          } else if (refusal.status === 409 || refusal.status === 404) {
            patch({ phase: 'broken', refusal });
          } else {
            patch({ phase: 'step', notice: 'tryAgain', refusal });
          }
          return;
        }

        if (take.outcome === 'retry') {
          // A retry is not a try: the same step stays, with the reason.
          patch({
            session: take.session,
            phase: 'step',
            notice: NOTICE_OF[take.reason ?? ''] ?? 'tryAgain',
          });
          return;
        }
        // `stopped`: the payer cannot go on; what was measured is handed in after the verdict.
        patch({ session: take.session, take, phase: 'verdict' });
      } finally {
        // A take is a try, not a work: it never stays. A failed delete costs only storage.
        if (assetId !== null) api.discard(assetId).catch(() => undefined);
        busy.current = false;
      }
    },
    [api, locale, patch, showStep, state.phase, state.session],
  );

  /** From the verdict to the next step, or to the end. */
  const next = useCallback(async () => {
    const session = state.session;
    if (busy.current || session === null || state.phase !== 'verdict') return;
    if (session.phase === 'done' || state.take?.outcome === 'stopped') {
      patch({ phase: 'ending', take: null });
      return;
    }
    busy.current = true;
    try {
      await showStep(session.attemptId, { take: null });
    } finally {
      busy.current = false;
    }
  }, [patch, showStep, state.phase, state.session, state.take]);

  /** Hand the session in: the ratings reach the learner's cards. */
  const finish = useCallback(async () => {
    const session = state.session;
    if (busy.current || session === null || state.phase !== 'ending') return;
    busy.current = true;
    patch({ phase: 'submitting' });
    try {
      const result = await api.submit(session.attemptId, locale);
      patch({ phase: 'result', result, refusal: null });
    } catch (e) {
      // 409: already handed in elsewhere; either way the learner can try again from here.
      patch({ phase: 'ending', refusal: refusalOf(e) });
    } finally {
      busy.current = false;
    }
  }, [api, locale, patch, state.phase, state.session]);

  /** After a fault: ask the engine where the session stands. */
  const reload = useCallback(async () => {
    const session = state.session;
    if (busy.current || session === null) return;
    busy.current = true;
    try {
      await showStep(session.attemptId, { refusal: null });
    } finally {
      busy.current = false;
    }
  }, [showStep, state.session]);

  const reset = useCallback(() => setState(INITIAL), []);

  return { ...state, start, sendTake, next, finish, reload, reset };
}

export type UseSoundSessionResult = ReturnType<typeof useSoundSession>;
