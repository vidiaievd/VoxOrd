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
    expect(mockUpsert).toHaveBeenCalledWith(progress('ex-a'));
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
});
