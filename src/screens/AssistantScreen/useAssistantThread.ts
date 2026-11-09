import { useCallback, useEffect, useRef, useState } from 'react';
import {
  contextKey,
  sendFeedback,
  sendMessage,
  type AssistContext,
  type AssistDraft,
  type AssistReason,
  type SendOutcome,
} from '../../api/assistant';
import { randomNonce } from '../../lib/reviewQueue';
import {
  answerText,
  assistantThreadStore,
  toHistory,
  type ThreadTurn,
} from '../../store/assistantThreadStore';
import { authStore } from '../../store/authStore';
import type { Unanswered } from './assistantLogic';

/**
 * A question still waiting for its answer, by user and context. Kept outside the screen: a
 * citation opens another screen in its place (the navigator holds one), and the answer that
 * arrives meanwhile is written to the thread all the same — coming back shows it, or the
 * wait (and the answer as written so far) if it is still out.
 */
interface Flight {
  text: string;
  outcome: Promise<SendOutcome>;
  /** The streamed answer so far; empty until its first piece. */
  draft: AssistDraft;
  watchers: Set<(draft: AssistDraft) => void>;
}

const inFlight = new Map<string, Flight>();

export interface FailedTurn {
  text: string;
  kind: Unanswered;
  reason: AssistReason | null;
}

export interface AssistantThread {
  turns: ThreadTurn[];
  loaded: boolean;
  /** The learner's question while its answer is awaited. */
  pending: string | null;
  /** The answer being written for `pending` — unchecked, empty until the first piece. */
  draft: AssistDraft;
  /** The last question when it brought no answer — shown with it, not kept in the thread. */
  failed: FailedTurn | null;
  send: (text: string) => void;
  retry: () => void;
  /** «Helpful / not helpful» on an answer. False when it did not reach the server. */
  giveFeedback: (turnId: string, helpful: boolean) => Promise<boolean>;
}

function turn(role: ThreadTurn['role'], text: string, extra: Partial<ThreadTurn> = {}): ThreadTurn {
  return { id: randomNonce(), role, text, at: new Date().toISOString(), ...extra };
}

/**
 * One context's conversation (mobile redesign 03, step 2). A question goes out with the tail
 * of the thread as history; only a question that was answered is written down, together with
 * its answer — a refusal or a silence leaves the stored thread as it was, so history never
 * carries a question the server did not take.
 */
export function useAssistantThread(context: AssistContext): AssistantThread {
  const ctxKey = contextKey(context);
  const [turns, setTurns] = useState<ThreadTurn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssistDraft>([]);
  /** Stops following the draft of the flight shown. */
  const unwatch = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState<FailedTurn | null>(null);

  // The context as of this render, for callbacks that outlive it.
  const live = useRef({ ctxKey, context, turns });
  live.current = { ctxKey, context, turns };

  const flightKey = useCallback(
    (key: string) => `${authStore.getState().user?.id ?? ''}|${key}`,
    [],
  );

  /** Waits for a question in flight, showing its draft, then shows the thread as stored. */
  const follow = useCallback(
    (key: string, flight: Flight) => {
      unwatch.current?.();
      flight.watchers.add(setDraft);
      unwatch.current = () => flight.watchers.delete(setDraft);
      setPending(flight.text);
      setDraft(flight.draft);
      setFailed(null);
      const { text } = flight;
      void flight.outcome.then(async (result) => {
        flight.watchers.delete(setDraft);
        if (live.current.ctxKey !== key) return;
        setTurns(await assistantThreadStore.getThread(key));
        setPending(null);
        setDraft([]);
        if (result.kind !== 'answer') {
          setFailed({
            text,
            kind: result.kind,
            reason: result.kind === 'refused' ? result.reason : null,
          });
        }
      });
    },
    [],
  );

  useEffect(() => {
    let current = true;
    setLoaded(false);
    setPending(null);
    setDraft([]);
    setFailed(null);
    void assistantThreadStore.getThread(ctxKey).then((stored) => {
      if (!current) return;
      setTurns(stored);
      setLoaded(true);
      const flight = inFlight.get(flightKey(ctxKey));
      if (flight) follow(ctxKey, flight);
    });
    return () => {
      current = false;
      unwatch.current?.();
      unwatch.current = null;
    };
  }, [ctxKey, flightKey, follow]);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      const { ctxKey: key, context: ctx, turns: shown } = live.current;
      const fKey = flightKey(key);
      if (text === '' || inFlight.has(fKey)) return;

      const question = turn('user', text);
      const flight: Flight = {
        text,
        draft: [],
        watchers: new Set(),
        outcome: sendMessage(ctx, toHistory(shown), text, (next) => {
          flight.draft = next;
          flight.watchers.forEach((watch) => watch(next));
        }).then(async (result) => {
          if (result.kind === 'answer') {
            const reply = turn('assistant', answerText(result.answer), { answer: result.answer });
            await assistantThreadStore.append(key, [question, reply]);
          }
          return result;
        }),
      };
      inFlight.set(fKey, flight);
      void flight.outcome.finally(() => inFlight.delete(fKey));
      follow(key, flight);
    },
    [flightKey, follow],
  );

  const retry = useCallback(() => {
    if (failed) send(failed.text);
  }, [failed, send]);

  const giveFeedback = useCallback(async (turnId: string, helpful: boolean) => {
    const target = live.current.turns.find((t) => t.id === turnId);
    if (!target?.answer || target.feedback) return false;
    const ok = await sendFeedback(target.answer.callId, helpful);
    if (!ok) return false;
    const mark: ThreadTurn['feedback'] = helpful ? 'helpful' : 'not_helpful';
    setTurns((all) => all.map((t) => (t.id === turnId ? { ...t, feedback: mark } : t)));
    await assistantThreadStore.setFeedback(live.current.ctxKey, turnId, helpful);
    return true;
  }, []);

  return { turns, loaded, pending, draft, failed, send, retry, giveFeedback };
}
