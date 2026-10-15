import { ApiError } from '../api/client';
import type {
  CaptureWordRequest,
  CaptureWordResponse,
} from '../api/personalVocabulary';

/** In-memory stand-in for the device's async storage. */
const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
  }),
}));

jest.mock('../api/personalVocabulary', () => ({
  captureWord: jest.fn(),
}));

import { captureWord } from '../api/personalVocabulary';
import { wordCaptureQueueStore } from './wordCaptureQueueStore';
import { authStore } from './authStore';

const LEARNER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OTHER = { id: 'user-2', email: 'x@y.z', roles: ['student'] };

const mockCapture = captureWord as jest.Mock;

const request = (surfaceForm: string): CaptureWordRequest => ({
  targetLanguage: 'nb',
  translationLanguage: 'ru',
  surfaceForm,
});

const response = (word: string): CaptureWordResponse =>
  ({
    word: { word, status: 'pending' },
    created: true,
  } as unknown as CaptureWordResponse);

const offline = () =>
  new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });

describe('wordCaptureQueueStore', () => {
  beforeEach(async () => {
    mockCapture.mockReset();
    // Drain whatever a previous test left queued, whoever's it is.
    mockCapture.mockResolvedValue(response('x'));
    for (const user of [OTHER, LEARNER]) {
      authStore.setSignedIn(user);
      await wordCaptureQueueStore.flush();
    }
    mockCapture.mockReset();
  });

  it('keeps a word captured offline for its own learner', async () => {
    mockCapture.mockRejectedValue(offline());
    await wordCaptureQueueStore.submit(request('selv'));

    authStore.setSignedIn(OTHER);
    mockCapture.mockReset();
    mockCapture.mockResolvedValue(response('selv'));
    await wordCaptureQueueStore.flush();
    expect(mockCapture).not.toHaveBeenCalled();
    expect(wordCaptureQueueStore.pendingCount).toBe(0);

    authStore.setSignedIn(LEARNER);
    expect(wordCaptureQueueStore.pendingCount).toBe(1);
    await wordCaptureQueueStore.flush();
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(wordCaptureQueueStore.pendingCount).toBe(0);
  });

  it('sends a word at once when there is a connection', async () => {
    mockCapture.mockResolvedValue(response('selv'));

    const outcome = await wordCaptureQueueStore.submit(request('selv'));

    expect(outcome.kind).toBe('saved');
    expect(wordCaptureQueueStore.pendingCount).toBe(0);
  });

  it('keeps a word tapped offline and sends it with the next flush', async () => {
    mockCapture.mockRejectedValueOnce(offline());

    const outcome = await wordCaptureQueueStore.submit(request('viktig'));

    expect(outcome.kind).toBe('queued');
    expect(wordCaptureQueueStore.pendingCount).toBe(1);
    expect(JSON.parse(mockStorage.get('queue') ?? '[]')).toHaveLength(1);

    mockCapture.mockResolvedValue(response('viktig'));
    await wordCaptureQueueStore.flush();

    expect(mockCapture).toHaveBeenLastCalledWith(request('viktig'));
    expect(wordCaptureQueueStore.pendingCount).toBe(0);
  });

  it('hands a refusal back instead of queueing it', async () => {
    mockCapture.mockRejectedValueOnce(
      new ApiError({ message: 'phrase', status: 422 }),
    );

    const outcome = await wordCaptureQueueStore.submit(request('ta seg av'));

    expect(outcome.kind).toBe('refused');
    expect(wordCaptureQueueStore.pendingCount).toBe(0);
  });

  it('a flush still offline keeps the word', async () => {
    mockCapture.mockRejectedValue(offline());
    await wordCaptureQueueStore.submit(request('ofte'));

    await wordCaptureQueueStore.flush();

    expect(wordCaptureQueueStore.pendingCount).toBe(1);
  });
});
