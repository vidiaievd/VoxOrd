const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
  }),
}));

const mockStart = jest.fn();
const mockSubmit = jest.fn();
jest.mock('../api/exercises', () => ({
  startOrJoinAttempt: (...args: unknown[]) => mockStart(...args),
  submitAttempt: (...args: unknown[]) => mockSubmit(...args),
}));
const mockUpsert = jest.fn();
jest.mock('../api/progress', () => ({ upsertProgress: (...args: unknown[]) => mockUpsert(...args) }));

import { ApiError } from '../api/client';
import { authStore } from './authStore';
import { exerciseOutboxStore } from './exerciseOutboxStore';

const LEARNER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OTHER = { id: 'user-2', email: 'x@y.z', roles: ['student'] };
const offline = () => new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });

const attempt = (exerciseId: string) => ({
  exerciseId,
  language: 'nb',
  submittedAnswer: { order: ['a'] },
  timeSpentSeconds: 12,
  locale: 'ru',
  answeredAt: '2026-10-15T10:00:00.000Z',
});
const progress = (contentId: string) => ({
  contentType: 'EXERCISE' as const,
  contentId,
  timeSpentSeconds: 12,
  score: 100,
  completed: true,
});

beforeEach(async () => {
  // Drain whatever a previous test left, whoever's it is.
  mockStart.mockReset().mockResolvedValue({ attemptId: 'att-1' });
  mockSubmit.mockReset().mockResolvedValue({ correct: true });
  mockUpsert.mockReset().mockResolvedValue({});
  for (const user of [OTHER, LEARNER]) {
    authStore.setSignedIn(user);
    await exerciseOutboxStore.flush();
  }
  mockStart.mockClear();
  mockSubmit.mockClear();
  mockUpsert.mockClear();
});

describe('exerciseOutboxStore', () => {
  it('replays an attempt as a start-or-join and a submit, then the progress behind it', async () => {
    await exerciseOutboxStore.enqueueAttempt(attempt('ex-1'));
    await exerciseOutboxStore.enqueueProgress(progress('ex-1'));
    expect(exerciseOutboxStore.pendingCount).toBe(2);

    await exerciseOutboxStore.flush();

    expect(mockStart).toHaveBeenCalledWith('ex-1', { language: 'nb', mode: 'PRACTICE' });
    expect(mockSubmit).toHaveBeenCalledWith('ex-1', 'att-1', {
      submittedAnswer: { order: ['a'] },
      timeSpentSeconds: 12,
      locale: 'ru',
    });
    expect(mockUpsert).toHaveBeenCalledWith(progress('ex-1'));
    expect(exerciseOutboxStore.pendingCount).toBe(0);
  });

  it('keeps everything, in order, while the server is out of reach', async () => {
    await exerciseOutboxStore.enqueueAttempt(attempt('ex-1'));
    await exerciseOutboxStore.enqueueProgress(progress('ex-1'));
    mockStart.mockRejectedValue(offline());

    await exerciseOutboxStore.flush();

    // The progress must not land ahead of the attempt it records.
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(exerciseOutboxStore.pendingCount).toBe(2);
  });

  it('drops an entry the server refuses and goes on', async () => {
    await exerciseOutboxStore.enqueueAttempt(attempt('gone'));
    await exerciseOutboxStore.enqueueProgress(progress('ex-2'));
    mockStart.mockRejectedValueOnce(new ApiError({ message: 'not found', status: 404 }));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await exerciseOutboxStore.flush();

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(exerciseOutboxStore.pendingCount).toBe(0);
  });

  it('sends work only in its own learner session', async () => {
    await exerciseOutboxStore.enqueueAttempt(attempt('ex-1'));

    authStore.setSignedIn(OTHER);
    await exerciseOutboxStore.flush();
    expect(mockStart).not.toHaveBeenCalled();
    expect(exerciseOutboxStore.pendingCount).toBe(0);

    authStore.setSignedIn(LEARNER);
    expect(exerciseOutboxStore.pendingCount).toBe(1);
    await exerciseOutboxStore.flush();
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});
