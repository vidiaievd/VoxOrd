import { ApiError, apiClient } from './client';
import { recordedSubmissions as recorded } from './__fixtures__/submissionsRecorded';
import { getMySubmissions, latestReviewed, parseSubmission, parseSubmissionsPage } from './submissions';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
  ApiError: jest.requireActual('./client').ApiError,
}));

const mockGet = apiClient.get as jest.Mock;
const now = new Date('2026-10-24T12:00:00.000Z');

function gateway(override: (path: string, query?: Record<string, unknown>) => unknown = () => undefined) {
  return async (path: string, options?: { query?: Record<string, unknown> }) => {
    const changed = override(path, options?.query);
    if (changed instanceof Error) throw changed;
    if (changed !== undefined) return changed;
    if (path === '/api/v1/attempts/mine') {
      return options?.query?.status === 'pending' ? recorded.pending : recorded.mine;
    }
    if (path === '/api/v1/profiles') return recorded.profiles;
    throw new ApiError({ message: `no route ${path}`, status: 404 });
  };
}

beforeEach(() => mockGet.mockReset());

describe('getMySubmissions (recorded from dev)', () => {
  it('reads the newest page, the waiting count and the teachers’ names', async () => {
    mockGet.mockImplementation(gateway());

    const result = (await getMySubmissions())!;

    expect(result.items).toHaveLength(15);
    expect(result.pendingCount).toBe(5);
    expect(result.pendingCapped).toBe(false);
    expect(result.items[0]).toMatchObject({
      attemptId: '7534e042-7fa0-4c6f-bff8-5ed5e043d0ab',
      title: 'Переведите предложение на норвежский.',
      courseTitle: 'Norsk B1 — Stein på stein',
      status: 'approved',
      decision: { by: 'teacher', byName: 'school', aiDrafted: false },
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/attempts/mine', { query: { limit: 50 } });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/attempts/mine', {
      query: { status: 'pending', limit: 100 },
    });
    // One lookup for every teacher on the page.
    expect(mockGet.mock.calls.filter(([p]) => p === '/api/v1/profiles')).toHaveLength(1);
  });

  it('keeps the reviews when the directory does not answer, without names', async () => {
    mockGet.mockImplementation(
      gateway((path) => (path === '/api/v1/profiles' ? new ApiError({ message: 'down', status: 503 }) : undefined)),
    );

    const result = (await getMySubmissions())!;

    expect(result.items[0].decision).toMatchObject({ by: 'teacher', byName: null });
  });

  it('throws when the engine is out of reach, so the cached list stays', async () => {
    const down = new ApiError({ message: 'down', status: 502 });
    mockGet.mockImplementation(gateway((path) => (path === '/api/v1/attempts/mine' ? down : undefined)));

    await expect(getMySubmissions()).rejects.toBe(down);
  });

  it('reads a refusal or a malformed answer as nothing to show', async () => {
    mockGet.mockImplementation(
      gateway((path) => (path === '/api/v1/attempts/mine' ? new ApiError({ message: 'no', status: 401 }) : undefined)),
    );
    expect(await getMySubmissions()).toBeNull();

    mockGet.mockImplementation(gateway((path) => (path === '/api/v1/attempts/mine' ? { rows: [] } : undefined)));
    expect(await getMySubmissions()).toBeNull();
  });

  it('says the waiting count may be larger when it fills the page', async () => {
    const full = { items: Array.from({ length: 100 }, () => recorded.pending.items[0]), nextCursor: 'x' };
    mockGet.mockImplementation(gateway((_p, q) => (q?.status === 'pending' ? full : undefined)));

    expect(await getMySubmissions()).toMatchObject({ pendingCount: 100, pendingCapped: true });
  });
});

describe('parseSubmission', () => {
  const row = recorded.mine.items[0];

  it('drops a row that is not a submission, not the whole page', () => {
    const page = parseSubmissionsPage({ items: [row, { ...row, status: 'partial' }, { ...row, submittedAt: 'later' }] });

    expect(page).toHaveLength(1);
  });

  it('drops a row whose decision is unreadable', () => {
    expect(parseSubmission({ ...row, decision: { ...row.decision, by: 'robot' } })).toBeNull();
  });

  it('names the work by its module or course when the exercise has no title', () => {
    expect(parseSubmission({ ...row, exercisePath: { course: 'C', module: 'M', exercise: null } })?.title).toBe('M');
    expect(parseSubmission({ ...row, exercisePath: { course: 'C', module: null, exercise: null } })?.title).toBe('C');
    expect(parseSubmission({ ...row, exercisePath: null })?.title).toBeNull();
  });
});

describe('latestReviewed', () => {
  const items = parseSubmissionsPage(recorded.mine)!;

  it('leads with the latest verdict given, not the latest work handed in', () => {
    // The writing task was handed in on 5 September and reviewed on 23 October — the newest
    // verdict on the page, though it is its last row.
    expect(latestReviewed(items, 'teacher', now)?.templateCode).toBe('writing_task');
  });

  it('says nothing about reviews older than two weeks', () => {
    expect(latestReviewed(items, 'teacher', new Date('2026-11-07T12:00:00.000Z'))).toBeNull();
  });

  it('keeps a teacher’s and a model’s reviews apart', () => {
    expect(latestReviewed(items, 'ai', now)).toBeNull();
  });
});
