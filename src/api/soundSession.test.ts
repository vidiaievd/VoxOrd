import { ApiError, apiClient } from './client';
import {
  getSoundCard,
  getSoundSessionItems,
  parseItems,
  parseResult,
  parseSession,
  parseSoundCard,
  parseStart,
  parseTake,
  postSoundTake,
  soundRefusal,
  SoundSessionUnreadableError,
  startSoundSession,
  submitSoundSession,
} from './soundSession';

jest.mock('./client', () => {
  const actual = jest.requireActual('./client');
  return { ...actual, apiClient: { get: jest.fn(), post: jest.fn() } };
});

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

const drillStep = {
  phase: 'drill',
  atomId: 'nb:kj',
  family: 'kj',
  elementIndex: 0,
  element: { kind: 'word', word: 'kyss' },
  say: 'kyss',
  sentence: 'Nå sier jeg kyss igjen.',
  fails: 1,
};

const session = {
  attemptId: 'a1',
  resumed: false,
  language: 'nb',
  basis: 'diagnostic',
  phase: 'drill',
  doneReason: null,
  takes: 2,
  maxTakes: 40,
  takeIndex: 2,
  sounds: [
    { atomId: 'nb:kj', family: 'kj', status: 'open' },
    { atomId: 'bogus', family: 'x', status: 'weird' },
  ],
  diagnostic: { measured: 8, total: 8 },
  step: drillStep,
};

describe('soundSession parsing', () => {
  it('reads a live session and drops sounds with an unknown status', () => {
    const s = parseSession(session);
    expect(s?.step).toEqual(drillStep);
    expect(s?.sounds).toEqual([{ atomId: 'nb:kj', family: 'kj', status: 'open' }]);
    expect(s?.diagnostic).toEqual({ measured: 8, total: 8 });
  });

  it('refuses a live session without a step, accepts a done one', () => {
    expect(parseSession({ ...session, step: null })).toBeNull();
    expect(parseSession({ ...session, phase: 'done', step: null, doneReason: 'finished' })?.doneReason).toBe(
      'finished',
    );
  });

  it('reads pairs and phrases', () => {
    const pair = parseSession({
      ...session,
      step: { ...drillStep, element: { kind: 'pair', words: ['a', 'b'], judged: [1] }, say: 'a' },
    });
    expect(pair?.step).toMatchObject({ element: { kind: 'pair', words: ['a', 'b'], judged: [1] } });
    const phrase = parseSession({ ...session, step: { ...drillStep, element: { kind: 'phrase', text: 'Hei' }, say: null } });
    expect(phrase?.step).toMatchObject({ element: { kind: 'phrase', text: 'Hei' }, say: null });
  });

  it('reads the budget as numbers from decimal strings', () => {
    const out = parseStart({
      ...session,
      budget: { payer: 'learner', metered: true, remainingCredits: '12.5', estimatedCredits: '35' },
    });
    expect(out?.budget).toEqual({ payer: 'learner', metered: true, remainingCredits: 12.5, estimatedCredits: 35 });
    expect(parseStart({ ...session, budget: { payer: 'nobody' } })?.budget).toBeNull();
  });

  it('reads items: clips without a url are dropped', () => {
    const out = parseItems({
      session,
      clips: [{ word: 'kyss', url: 'https://x/y.mp3' }, { word: 'no-url' }],
      instruction: { atomId: 'nb:kj', title: 'kj', howTo: 'Tongue', commonError: null },
    });
    expect(out?.clips).toEqual([{ word: 'kyss', url: 'https://x/y.mp3', mimeType: 'audio/mpeg' }]);
    expect(out?.instruction?.howTo).toBe('Tongue');
    expect(parseItems({ session: { nope: 1 } })).toBeNull();
  });

  it('reads a take: events, verdict, toneme melody', () => {
    const out = parseTake({
      outcome: 'judged',
      reason: null,
      verdict: { measured: true, passed: false, key: 'KJ:major' },
      feedback: null,
      toneme: { tone: 2, verdict: 'wrong', melody: { stepMs: 10, learner: [1, null], reference: [2, 3] } },
      events: [
        { kind: 'sound_failed', atomId: 'nb:kj' },
        { kind: 'diagnostic_done', weak: ['nb:kj', 3] },
        { kind: 'session_done', reason: 'zzz' },
      ],
      session,
    });
    expect(out?.verdict).toEqual({ measured: true, passed: false, key: 'KJ:major' });
    expect(out?.toneme?.melody.learner).toEqual([1, null]);
    expect(out?.events).toEqual([
      { kind: 'sound_failed', atomId: 'nb:kj' },
      { kind: 'diagnostic_done', weak: ['nb:kj'] },
    ]);
  });

  it('drops a toneme with a broken melody and rejects an unknown outcome', () => {
    const t = parseTake({
      outcome: 'retry',
      toneme: { tone: 1, verdict: 'ok', melody: { stepMs: 0, learner: [], reference: [] } },
      session,
    });
    expect(t?.toneme).toBeNull();
    expect(parseTake({ outcome: 'weird', session })).toBeNull();
  });

  it('reads the result and ratings', () => {
    const out = parseResult({
      score: 70,
      doneReason: 'stopped',
      sounds: [
        { atomId: 'nb:kj', status: 'passed', passes: 2, fails: 1, rating: 'HARD' },
        { atomId: 'nb:y', status: 'failed', rating: 'BAD' },
      ],
      diagnosticWeak: ['nb:y'],
      flagged: [],
    });
    expect(out?.sounds[0]?.rating).toBe('HARD');
    expect(out?.sounds[1]).toMatchObject({ rating: null, passes: 0, fails: 0 });
  });

  it('reads the card of a sound', () => {
    const card = parseSoundCard({ atomId: 'nb:kj', family: 'kj', ipa: 'ç', title: 'kj', howTo: 'x', carrierWords: ['kyss', 1] });
    expect(card).toMatchObject({ ipa: 'ç', howTo: 'x', description: null, carrierWords: ['kyss'] });
    expect(parseSoundCard({ atomId: 'nb:kj' })).toBeNull();
  });
});

describe('soundSession calls', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('starts with the chosen sound only when given', async () => {
    mockPost.mockResolvedValue(session);
    await startSoundSession('nb');
    expect(mockPost.mock.calls[0]?.[1]).toEqual({ language: 'nb' });
    await startSoundSession('nb', 'nb:kj');
    expect(mockPost).toHaveBeenLastCalledWith(
      '/api/v1/sound-sessions',
      { language: 'nb', atomId: 'nb:kj' },
      expect.any(Object),
    );
  });

  it('throws Unreadable on a 200 it cannot read', async () => {
    mockPost.mockResolvedValue({ junk: true });
    await expect(startSoundSession('nb')).rejects.toBeInstanceOf(SoundSessionUnreadableError);
  });

  it('routes items, take, submit and card to the right paths', async () => {
    mockGet.mockResolvedValue({ session, clips: [] });
    await getSoundSessionItems('a1', 'uk');
    expect(mockGet).toHaveBeenCalledWith('/api/v1/sound-sessions/a1/items', { query: { locale: 'uk' } });

    mockPost.mockResolvedValue({ outcome: 'retry', session });
    await postSoundTake('a1', { recordingAssetId: 'r', takeIndex: 2, explanationLanguage: 'uk' });
    expect(mockPost.mock.calls[0]?.[0]).toBe('/api/v1/sound-sessions/a1/takes');

    mockPost.mockResolvedValue({ sounds: [] });
    await submitSoundSession('a1', 'uk');
    expect(mockPost.mock.calls[1]?.[0]).toBe('/api/v1/sound-sessions/a1/submit');
    expect(mockPost.mock.calls[1]?.[2]).toMatchObject({ query: { locale: 'uk' } });

    mockGet.mockResolvedValue({ atomId: 'nb:kj', family: 'kj' });
    await getSoundCard('nb:kj', 'uk');
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/sound-atoms/nb%3Akj', { query: { locale: 'uk' } });
  });
});

describe('soundRefusal', () => {
  it('keeps the code and the numbers the engine sent', () => {
    const e = new ApiError({
      message: 'x',
      status: 409,
      code: 'STALE_TAKE',
      body: { code: 'STALE_TAKE', takeIndex: 3 },
    });
    expect(soundRefusal(e)).toEqual({ status: 409, code: 'STALE_TAKE', retryAfterMs: null, takeIndex: 3 });
  });

  it('falls back to the code in the body, and is null for faults', () => {
    const e = new ApiError({ message: 'x', status: 422, body: { code: 'SESSION_LIMIT', retryAfterMs: 5000 } });
    expect(soundRefusal(e)).toMatchObject({ code: 'SESSION_LIMIT', retryAfterMs: 5000 });
    expect(soundRefusal(new Error('boom'))).toBeNull();
  });
});
