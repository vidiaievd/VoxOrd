import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { AssistAnswer, AssistContext, AssistTurn, SendOutcome } from '../../api/assistant';
import type { ThreadTurn } from '../../store/assistantThreadStore';

const mockSend = jest.fn<Promise<SendOutcome>, [AssistContext, readonly AssistTurn[], string]>();
const mockFeedback = jest.fn<Promise<boolean>, [string, boolean]>();
jest.mock('../../api/assistant', () => ({
  ...jest.requireActual('../../api/assistant'),
  sendMessage: (...args: [AssistContext, readonly AssistTurn[], string]) => mockSend(...args),
  sendFeedback: (...args: [string, boolean]) => mockFeedback(...args),
}));

/** The thread store, in memory: one list of turns per context key. */
const mockThreads = new Map<string, ThreadTurn[]>();
jest.mock('../../store/assistantThreadStore', () => ({
  ...jest.requireActual('../../store/assistantThreadStore'),
  assistantThreadStore: {
    getThread: async (key: string) => mockThreads.get(key) ?? [],
    append: async (key: string, turns: ThreadTurn[]) => {
      mockThreads.set(key, [...(mockThreads.get(key) ?? []), ...turns]);
    },
    setFeedback: async (key: string, id: string, helpful: boolean) => {
      mockThreads.set(
        key,
        (mockThreads.get(key) ?? []).map((t) =>
          t.id === id ? { ...t, feedback: helpful ? 'helpful' : 'not_helpful' } : t,
        ),
      );
    },
  },
}));

jest.mock('../../store/authStore', () => ({
  authStore: { getState: () => ({ status: 'signedIn', user: { id: 'user-1' }, offline: false }) },
}));

import { contextKey } from '../../api/assistant';
import { useAssistantThread, type AssistantThread } from './useAssistantThread';

const unit: AssistContext = { kind: 'unit', courseId: 'c1', unitId: 'u1' };
const KEY = contextKey(unit);
const answer: AssistAnswer = {
  callId: 'call-1',
  blocks: [{ type: 'text', text: 'Verbet står på plass to.', emphasis: [] }],
  citations: [],
  suggestions: [],
};

let seen: AssistantThread;
function Probe({ context }: { context: AssistContext }) {
  seen = useAssistantThread(context);
  return null;
}

async function mount(context: AssistContext = unit) {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe context={context} />);
  });
  return tree;
}

/** A send whose outcome the test hands over when it chooses. */
function deferredSend() {
  let resolve!: (o: SendOutcome) => void;
  mockSend.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
  return (o: SendOutcome) => act(async () => resolve(o));
}

beforeEach(() => {
  mockThreads.clear();
  mockSend.mockReset();
  mockFeedback.mockReset();
});

it('writes a question down only together with its answer', async () => {
  await mount();
  const answerWith = deferredSend();
  await act(async () => seen.send('  Hvorfor?  '));
  expect(seen.pending).toBe('Hvorfor?');
  expect(mockThreads.get(KEY)).toBeUndefined();

  await answerWith({ kind: 'answer', answer });
  expect(seen.pending).toBeNull();
  expect(seen.turns.map((t) => [t.role, t.text])).toEqual([
    ['user', 'Hvorfor?'],
    ['assistant', 'Verbet står på plass to.'],
  ]);
  expect(mockThreads.get(KEY)).toHaveLength(2);
});

it('keeps the thread as it was when the question brings no answer, and asks again on retry', async () => {
  await mount();
  const silence = deferredSend();
  await act(async () => seen.send('Hvorfor?'));
  await silence({ kind: 'silent' });

  expect(seen.failed).toEqual({ text: 'Hvorfor?', kind: 'silent', reason: null });
  expect(seen.turns).toEqual([]);
  expect(mockThreads.get(KEY)).toBeUndefined();

  const second = deferredSend();
  await act(async () => seen.retry());
  expect(mockSend).toHaveBeenLastCalledWith(unit, [], 'Hvorfor?');
  await second({ kind: 'answer', answer });
  expect(seen.failed).toBeNull();
  expect(seen.turns).toHaveLength(2);
});

it('sends the thread so far as history', async () => {
  mockThreads.set(KEY, [
    { id: 'a', role: 'user', text: 'Første', at: '2026-10-28T10:00:00Z' },
    { id: 'b', role: 'assistant', text: 'Svar', at: '2026-10-28T10:00:01Z', answer },
  ]);
  await mount();
  mockSend.mockResolvedValueOnce({ kind: 'silent' });
  await act(async () => seen.send('Andre'));
  expect(mockSend).toHaveBeenCalledWith(
    unit,
    [
      { role: 'user', text: 'Første' },
      { role: 'assistant', text: 'Svar' },
    ],
    'Andre',
  );
});

it('lands an answer that arrives after the screen has gone, and shows the wait on return', async () => {
  const first = await mount();
  const answerWith = deferredSend();
  await act(async () => seen.send('Hvorfor?'));
  await act(async () => first.unmount());

  // Back from a citation before the answer is in: the question is still out.
  await mount();
  expect(seen.pending).toBe('Hvorfor?');
  await act(async () => seen.send('Igjen'));
  expect(mockSend).toHaveBeenCalledTimes(1);

  await answerWith({ kind: 'answer', answer });
  expect(seen.pending).toBeNull();
  expect(seen.turns).toHaveLength(2);
});

it('takes one feedback per answer and remembers it', async () => {
  mockThreads.set(KEY, [{ id: 'b', role: 'assistant', text: 'Svar', at: '2026-10-28T10:00:01Z', answer }]);
  await mount();
  mockFeedback.mockResolvedValueOnce(true);
  let ok = false;
  await act(async () => {
    ok = await seen.giveFeedback('b', false);
  });
  expect(ok).toBe(true);
  expect(mockFeedback).toHaveBeenCalledWith('call-1', false);
  expect(seen.turns[0].feedback).toBe('not_helpful');
  expect(mockThreads.get(KEY)?.[0].feedback).toBe('not_helpful');

  await act(async () => {
    ok = await seen.giveFeedback('b', true);
  });
  expect(ok).toBe(false);
  expect(mockFeedback).toHaveBeenCalledTimes(1);
});

it('keeps a thread per context', async () => {
  mockThreads.set(contextKey({ kind: 'free' }), [{ id: 'f', role: 'user', text: 'Fri', at: '2026-10-28T10:00:00Z' }]);
  const tree = await mount();
  expect(seen.turns).toEqual([]);
  await act(async () => tree.update(<Probe context={{ kind: 'free' }} />));
  expect(seen.turns.map((t) => t.text)).toEqual(['Fri']);
});
