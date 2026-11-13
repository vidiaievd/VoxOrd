import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../api/client';
import { SoundSessionUnreadableError, type SoundSession, type TakeResult } from '../api/soundSession';
import type { Capture } from '../services/recorder';
import { useSoundSession, type SoundSessionApi, type UseSoundSessionResult } from './useSoundSession';

const session = (over: Partial<SoundSession> = {}): SoundSession => ({
  attemptId: 'a1',
  resumed: false,
  language: 'nb',
  basis: 'diagnostic',
  phase: 'drill',
  doneReason: null,
  takes: 0,
  maxTakes: 40,
  takeIndex: 0,
  sounds: [],
  diagnostic: null,
  step: {
    phase: 'drill',
    atomId: 'nb:kj',
    family: 'kj',
    elementIndex: 0,
    element: { kind: 'word', word: 'kyss' },
    say: 'kyss',
    sentence: 'Nå sier jeg kyss igjen.',
    fails: 0,
  },
  ...over,
});

const take = (over: Partial<TakeResult> = {}): TakeResult => ({
  outcome: 'judged',
  reason: null,
  verdict: { measured: true, passed: true, key: null },
  feedback: null,
  toneme: null,
  events: [],
  session: session({ takes: 1, takeIndex: 1 }),
  ...over,
});

const capture: Capture = { path: '/c/t.m4a', mimeType: 'audio/mp4', seconds: 1, size: 10, envelope: [] };

function makeApi(over: Partial<SoundSessionApi> = {}) {
  const api = {
    start: jest.fn(async () => ({ session: session(), budget: null })),
    items: jest.fn(async () => ({ session: session(), clips: [], instruction: null })),
    take: jest.fn(async () => take()),
    submit: jest.fn(async () => ({ score: 90, doneReason: 'finished', sounds: [], diagnosticWeak: [], flagged: [] })),
    settle: jest.fn(async () => undefined),
    upload: jest.fn(async () => ({ assetId: 'asset-1' })),
    discard: jest.fn(async () => undefined),
    ...over,
  };
  return api as unknown as SoundSessionApi & typeof api;
}

async function render(api: SoundSessionApi) {
  const out: { current: UseSoundSessionResult | null } = { current: null };
  function Probe() {
    out.current = useSoundSession({ language: 'nb', locale: 'uk', api });
    return null;
  }
  await act(async () => {
    ReactTestRenderer.create(<Probe />);
  });
  return out as { current: UseSoundSessionResult };
}

const refuse = (status: number, body: Record<string, unknown>) =>
  new ApiError({ message: 'x', status, code: (body.code as string) ?? null, body });

describe('useSoundSession', () => {
  it('starts and lands on the first step', async () => {
    const api = makeApi();
    const h = await render(api);
    await act(async () => h.current.start('nb:kj'));
    expect(api.start).toHaveBeenCalledWith('nb', 'nb:kj');
    expect(api.items).toHaveBeenCalledWith('a1', 'uk');
    expect(h.current.phase).toBe('step');
  });

  it('keeps the door\'s code when the start is refused, and a readable shape for faults', async () => {
    const api = makeApi({ start: jest.fn(async () => { throw refuse(422, { code: 'SESSION_LIMIT', retryAfterMs: 5 }); }) });
    const h = await render(api);
    await act(async () => h.current.start());
    expect(h.current.phase).toBe('refused');
    expect(h.current.refusal).toMatchObject({ code: 'SESSION_LIMIT', retryAfterMs: 5 });

    const api2 = makeApi({ start: jest.fn(async () => { throw new SoundSessionUnreadableError(); }) });
    const h2 = await render(api2);
    await act(async () => h2.current.start());
    expect(h2.current.refusal).toMatchObject({ code: 'UNREADABLE' });
  });

  it('opens a finished session straight on the hand-in', async () => {
    const api = makeApi({ start: jest.fn(async () => ({ session: session({ phase: 'done', step: null }), budget: null })) });
    const h = await render(api);
    await act(async () => h.current.start());
    expect(h.current.phase).toBe('ending');
    expect(api.items).not.toHaveBeenCalled();
  });

  it('sends a take: uploads, waits for the variant, judges, discards the recording', async () => {
    const api = makeApi();
    const h = await render(api);
    await act(async () => h.current.start());
    await act(async () => h.current.sendTake(capture));
    expect(api.upload).toHaveBeenCalledWith({ capture, attemptId: 'a1', filename: 'take-0.m4a' });
    expect(api.settle).toHaveBeenCalledWith('asset-1');
    expect(api.take).toHaveBeenCalledWith('a1', { recordingAssetId: 'asset-1', takeIndex: 0, explanationLanguage: 'uk' });
    expect(api.discard).toHaveBeenCalledWith('asset-1');
    expect(h.current.phase).toBe('verdict');
    expect(h.current.session?.takeIndex).toBe(1);
  });

  it('a failed upload costs no try and asks nothing of the engine', async () => {
    const api = makeApi({ upload: jest.fn(async () => { throw new Error('net'); }) });
    const h = await render(api);
    await act(async () => h.current.start());
    await act(async () => h.current.sendTake(capture));
    expect(h.current.phase).toBe('step');
    expect(h.current.notice).toBe('uploadFailed');
    expect(api.take).not.toHaveBeenCalled();
    expect(api.discard).not.toHaveBeenCalled();
  });

  it('a retry stays on the step with its reason and does not count', async () => {
    const api = makeApi({ take: jest.fn(async () => take({ outcome: 'retry', reason: 'recording_inaudible', session: session() })) });
    const h = await render(api);
    await act(async () => h.current.start());
    await act(async () => h.current.sendTake(capture));
    expect(h.current.phase).toBe('step');
    expect(h.current.notice).toBe('inaudible');
    expect(h.current.session?.takeIndex).toBe(0);
  });

  it('STALE_TAKE looks at the session again instead of failing', async () => {
    const api = makeApi({ take: jest.fn(async () => { throw refuse(409, { code: 'STALE_TAKE', takeIndex: 3 }); }) });
    const h = await render(api);
    await act(async () => h.current.start());
    await act(async () => h.current.sendTake(capture));
    expect(api.items).toHaveBeenCalledTimes(2);
    expect(h.current.phase).toBe('step');
    expect(h.current.notice).toBe('stale');
  });

  it('other 409/404 break the session; other faults let the learner try again', async () => {
    const api = makeApi({ take: jest.fn(async () => { throw refuse(409, { code: 'SESSION_CLOSED' }); }) });
    const h = await render(api);
    await act(async () => h.current.start());
    await act(async () => h.current.sendTake(capture));
    expect(h.current.phase).toBe('broken');

    const api2 = makeApi({ take: jest.fn(async () => { throw refuse(503, {}); }) });
    const h2 = await render(api2);
    await act(async () => h2.current.start());
    await act(async () => h2.current.sendTake(capture));
    expect(h2.current.phase).toBe('step');
    expect(h2.current.notice).toBe('tryAgain');
  });

  it('goes next to the following step, or to the end when stopped, then hands in', async () => {
    const api = makeApi({ take: jest.fn(async () => take({ outcome: 'stopped' })) });
    const h = await render(api);
    await act(async () => h.current.start());
    await act(async () => h.current.sendTake(capture));
    await act(async () => h.current.next());
    expect(h.current.phase).toBe('ending');
    await act(async () => h.current.finish());
    expect(api.submit).toHaveBeenCalledWith('a1', 'uk');
    expect(h.current.phase).toBe('result');
    expect(h.current.result?.score).toBe(90);
  });

  it('a failed hand-in stays at the end with the refusal', async () => {
    const api = makeApi({
      take: jest.fn(async () => take({ outcome: 'stopped' })),
      submit: jest.fn(async () => { throw refuse(409, { code: 'SESSION_CLOSED' }); }),
    });
    const h = await render(api);
    await act(async () => h.current.start());
    await act(async () => h.current.sendTake(capture));
    await act(async () => h.current.next());
    await act(async () => h.current.finish());
    expect(h.current.phase).toBe('ending');
    expect(h.current.refusal?.code).toBe('SESSION_CLOSED');
  });

  it('reload asks the engine where the session stands', async () => {
    const api = makeApi({ take: jest.fn(async () => { throw refuse(404, {}); }) });
    const h = await render(api);
    await act(async () => h.current.start());
    await act(async () => h.current.sendTake(capture));
    expect(h.current.phase).toBe('broken');
    await act(async () => h.current.reload());
    expect(h.current.phase).toBe('step');
    expect(h.current.refusal).toBeNull();
  });
});
