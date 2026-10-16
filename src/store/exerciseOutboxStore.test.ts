const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
  }),
}));

const mockRemote = {
  startAttempt: jest.fn(),
  abandonAttempt: jest.fn(),
  startOrJoinAttempt: jest.fn(),
  submitAttempt: jest.fn(),
  answerQuestion: jest.fn(),
  checkRow: jest.fn(),
  revealAnswers: jest.fn(),
  selfCheck: jest.fn(),
  saveDraft: jest.fn(),
};
jest.mock('../api/exercises', () => ({
  get remoteAttempts() {
    return mockRemote;
  },
}));
const mockUpsert = jest.fn();
jest.mock('../api/progress', () => ({ upsertProgress: (...args: unknown[]) => mockUpsert(...args) }));

import { ApiError } from '../api/client';
import { authStore } from './authStore';
import { exerciseOutboxStore } from './exerciseOutboxStore';

const LEARNER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OTHER = { id: 'user-2', email: 'x@y.z', roles: ['student'] };
const offline = () => new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });

const attempt = (id: string, userId = LEARNER.id) => ({
  id,
  userId,
  exerciseId: `ex-${id}`,
  targetLanguage: 'nb',
});
const submitOp = (answer: unknown) => ({
  op: 'submit' as const,
  body: { submittedAnswer: answer, timeSpentSeconds: 5, locale: 'ru' },
});
const progress = (contentId: string) => ({
  contentType: 'EXERCISE' as const,
  contentId,
  timeSpentSeconds: 12,
  score: 100,
  completed: true,
});

let serverIds = 0;
beforeEach(async () => {
  Object.values(mockRemote).forEach(fn => fn.mockReset());
  mockRemote.startOrJoinAttempt.mockImplementation(async () => ({ attemptId: `srv-${++serverIds}` }));
  mockUpsert.mockReset().mockResolvedValue({});
  // Drain whatever a previous test left, whoever's it is.
  for (const user of [OTHER, LEARNER]) {
    authStore.setSignedIn(user);
    await exerciseOutboxStore.flush();
  }
  Object.values(mockRemote).forEach(fn => fn.mockClear());
  mockUpsert.mockClear();
});

describe('exerciseOutboxStore', () => {
  it('replays a local attempt on one server attempt, call by call, then the progress behind it', async () => {
    await exerciseOutboxStore.recordLocalOp(attempt('a'), submitOp({ x: 1 }));
    await exerciseOutboxStore.recordLocalOp(attempt('a'), { op: 'reveal' });
    await exerciseOutboxStore.enqueueProgress(progress('ex-a'));
    // Joins the entry already queued for the attempt.
    expect(exerciseOutboxStore.pendingCount).toBe(2);

    await exerciseOutboxStore.flush();

    expect(mockRemote.startOrJoinAttempt).toHaveBeenCalledTimes(1);
    const serverId = (await mockRemote.startOrJoinAttempt.mock.results[0].value).attemptId;
    expect(mockRemote.submitAttempt).toHaveBeenCalledWith('ex-a', serverId, submitOp({ x: 1 }).body);
    expect(mockRemote.revealAnswers).toHaveBeenCalledWith('ex-a', serverId);
    // Dated when it was queued: it was queued because the server could not be reached.
    expect(mockUpsert).toHaveBeenCalledWith({ ...progress('ex-a'), occurredAt: expect.any(String) });
    expect(exerciseOutboxStore.pendingCount).toBe(0);
  });

  it('goes on from where it stopped, on the same server attempt', async () => {
    await exerciseOutboxStore.recordLocalOp(attempt('b'), submitOp(1));
    await exerciseOutboxStore.recordLocalOp(attempt('b'), submitOp(2));
    mockRemote.submitAttempt.mockResolvedValueOnce({}).mockRejectedValueOnce(offline());

    await exerciseOutboxStore.flush();
    expect(mockRemote.submitAttempt).toHaveBeenCalledTimes(2);
    expect(exerciseOutboxStore.pendingCount).toBe(1);

    // The learner goes on offline meanwhile; the call joins the same attempt.
    await exerciseOutboxStore.recordLocalOp(attempt('b'), submitOp(3));
    mockRemote.submitAttempt.mockResolvedValue({});
    await exerciseOutboxStore.flush();

    expect(mockRemote.startOrJoinAttempt).toHaveBeenCalledTimes(1);
    const bodies = mockRemote.submitAttempt.mock.calls.map(call => call[2].submittedAnswer);
    // The first went through once; the second is sent again, then the third.
    expect(bodies).toEqual([1, 2, 2, 3]);
    expect(exerciseOutboxStore.pendingCount).toBe(0);
  });

  it('keeps everything, in order, while the server is out of reach', async () => {
    await exerciseOutboxStore.recordLocalOp(attempt('c'), submitOp(1));
    await exerciseOutboxStore.enqueueProgress(progress('ex-c'));
    mockRemote.startOrJoinAttempt.mockRejectedValue(offline());

    await exerciseOutboxStore.flush();

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(exerciseOutboxStore.pendingCount).toBe(2);
    mockRemote.startOrJoinAttempt.mockImplementation(async () => ({ attemptId: 'srv-c' }));
  });

  it('drops a call the server refuses and goes on with the rest', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await exerciseOutboxStore.recordLocalOp(attempt('d'), submitOp(1));
    await exerciseOutboxStore.recordLocalOp(attempt('d'), submitOp(2));
    mockRemote.submitAttempt
      .mockRejectedValueOnce(new ApiError({ message: 'closed', status: 422 }))
      .mockResolvedValueOnce({});

    await exerciseOutboxStore.flush();

    expect(mockRemote.submitAttempt).toHaveBeenCalledTimes(2);
    expect(exerciseOutboxStore.pendingCount).toBe(0);
  });

  it('replays every kind of call by its own route', async () => {
    const a = attempt('e');
    await exerciseOutboxStore.recordLocalOp(a, { op: 'answer', body: { questionId: 'q1', text: 'x' } });
    await exerciseOutboxStore.recordLocalOp(a, {
      op: 'checkRow',
      body: { rowId: 'r1', placement: { s: ['c1'] } },
    });
    await exerciseOutboxStore.recordLocalOp(a, { op: 'selfCheck', draftAnswer: { items: {} } });
    await exerciseOutboxStore.recordLocalOp(a, { op: 'draft', draftAnswer: { d: 1 } });

    await exerciseOutboxStore.flush();

    const serverId = (await mockRemote.startOrJoinAttempt.mock.results[0].value).attemptId;
    expect(mockRemote.answerQuestion).toHaveBeenCalledWith('ex-e', serverId, { questionId: 'q1', text: 'x' });
    expect(mockRemote.checkRow).toHaveBeenCalledWith('ex-e', serverId, {
      rowId: 'r1',
      placement: { s: ['c1'] },
    });
    expect(mockRemote.selfCheck).toHaveBeenCalledWith('ex-e', serverId, { items: {} });
    expect(mockRemote.saveDraft).toHaveBeenCalledWith('ex-e', serverId, { d: 1 });
  });

  it('sends work only in its own learner session', async () => {
    await exerciseOutboxStore.recordLocalOp(attempt('f'), submitOp(1));

    authStore.setSignedIn(OTHER);
    await exerciseOutboxStore.flush();
    expect(mockRemote.startOrJoinAttempt).not.toHaveBeenCalled();
    expect(exerciseOutboxStore.pendingCount).toBe(0);

    authStore.setSignedIn(LEARNER);
    expect(exerciseOutboxStore.pendingCount).toBe(1);
    await exerciseOutboxStore.flush();
    expect(mockRemote.submitAttempt).toHaveBeenCalledTimes(1);
  });

  it('replays each call dated when the phone made it, and the start when it began (offline plan, B4)', async () => {
    const dated = { ...attempt('t'), startedAt: '2026-10-14T08:00:00.000Z' };
    await exerciseOutboxStore.recordLocalOp(dated, {
      op: 'answer',
      body: { questionId: 'q1', text: 'x' },
      at: '2026-10-14T08:01:00.000Z',
    });
    await exerciseOutboxStore.recordLocalOp(dated, { ...submitOp({ x: 1 }), at: '2026-10-14T08:02:00.000Z' });
    await exerciseOutboxStore.recordLocalOp(dated, { op: 'reveal', at: '2026-10-14T08:03:00.000Z' });

    await exerciseOutboxStore.flush();

    expect(mockRemote.startOrJoinAttempt).toHaveBeenCalledWith(
      'ex-t',
      { language: 'nb', mode: 'PRACTICE' },
      { clientAt: '2026-10-14T08:00:00.000Z' },
    );
    const serverId = (await mockRemote.startOrJoinAttempt.mock.results[0].value).attemptId;
    expect(mockRemote.answerQuestion).toHaveBeenCalledWith(
      'ex-t',
      serverId,
      { questionId: 'q1', text: 'x' },
      { clientAt: '2026-10-14T08:01:00.000Z' },
    );
    expect(mockRemote.submitAttempt).toHaveBeenCalledWith('ex-t', serverId, submitOp({ x: 1 }).body, {
      clientAt: '2026-10-14T08:02:00.000Z',
    });
    // The server keeps no time for a reveal.
    expect(mockRemote.revealAnswers).toHaveBeenCalledWith('ex-t', serverId);
  });

  describe('a minimal_pairs sitting dealt on the phone (offline plan, B6)', () => {
    const draw = [{ n: 1, pairId: 'p', wordId: 'w1', side: 0, optionIds: ['w2', 'w1'] }];
    // Each its own: the local → server id map outlives a test.
    const sitting = (id: string) => ({ ...attempt(id), probeDraw: draw });
    const answerOp = { op: 'answer' as const, body: { questionId: 'p1', optionId: 'w1' } };
    const conflict = (openAttemptId: string) =>
      new ApiError({
        message: 'Another sitting of this exercise is open',
        status: 409,
        code: 'MP_DRAW_CONFLICT',
        body: { code: 'MP_DRAW_CONFLICT', openAttemptId },
      });

    it('starts with the draw it was dealt, never joining whatever is open', async () => {
      mockRemote.startAttempt.mockResolvedValueOnce({ attemptId: 'srv-mp' });
      await exerciseOutboxStore.recordLocalOp(sitting('mp'), answerOp);
      await exerciseOutboxStore.flush();

      expect(mockRemote.startAttempt).toHaveBeenCalledWith('ex-mp', {
        language: 'nb',
        mode: 'PRACTICE',
        probeDraw: draw,
      });
      expect(mockRemote.startOrJoinAttempt).not.toHaveBeenCalled();
      expect(mockRemote.answerQuestion).toHaveBeenCalledWith('ex-mp', 'srv-mp', answerOp.body);
      expect(exerciseOutboxStore.pendingCount).toBe(0);
    });

    it('abandons a sitting left open on the web and starts once more', async () => {
      mockRemote.startAttempt
        .mockRejectedValueOnce(conflict('srv-web'))
        .mockResolvedValueOnce({ attemptId: 'srv-mp' });
      await exerciseOutboxStore.recordLocalOp(sitting('mp2'), answerOp);
      await exerciseOutboxStore.flush();

      expect(mockRemote.abandonAttempt).toHaveBeenCalledWith('ex-mp2', 'srv-web');
      expect(mockRemote.startAttempt).toHaveBeenCalledTimes(2);
      expect(mockRemote.answerQuestion).toHaveBeenCalledWith('ex-mp2', 'srv-mp', answerOp.body);
    });

    it('keeps the sitting while the server is out of reach, and drops one it refuses', async () => {
      mockRemote.startAttempt.mockRejectedValueOnce(offline());
      await exerciseOutboxStore.recordLocalOp(sitting('mp3'), answerOp);
      await exerciseOutboxStore.flush();
      expect(exerciseOutboxStore.pendingCount).toBe(1);

      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockRemote.startAttempt.mockRejectedValueOnce(
        new ApiError({ message: 'spent', status: 422, code: 'MP_SITTINGS_SPENT' }),
      );
      await exerciseOutboxStore.flush();
      expect(exerciseOutboxStore.pendingCount).toBe(0);
      expect(mockRemote.answerQuestion).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('MP_SITTINGS_SPENT'));
      error.mockRestore();
    });
  });
});
