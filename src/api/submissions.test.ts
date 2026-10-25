import { ApiError, apiClient } from './client';
import { recordedSubmissions as recorded } from './__fixtures__/submissionsRecorded';
import {
  getMySubmissions,
  latestReviewed,
  latestSchoolFeedback,
  parseSubmission,
  parseSubmissionsPage,
} from './submissions';

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

  it('reads a model’s provisional verdict on waiting work, and only there (plan 80)', () => {
    const provisional = {
      outcome: 'approved',
      comment: 'Bra jobbet.',
      at: '2026-10-25T09:01:00.000Z',
      countsAt: '2026-11-01T09:00:00.000Z',
      model: 'secret',
    };
    const waiting = { ...row, status: 'pending', decision: null, provisional };

    expect(parseSubmission(waiting)?.provisional).toEqual({
      outcome: 'approved',
      comment: 'Bra jobbet.',
      at: '2026-10-25T09:01:00.000Z',
      countsAt: '2026-11-01T09:00:00.000Z',
    });
    expect(parseSubmission({ ...row, provisional })?.provisional).toBeNull();
    expect(parseSubmission({ ...waiting, provisional: { ...provisional, outcome: 'maybe' } })).toMatchObject({
      status: 'pending',
      provisional: null,
    });
  });

  it('says when a model’s verdict counted at the school’s term (plan 80)', () => {
    const decision = { ...row.decision, by: 'ai', byUserId: null, acceptedAtTerm: true };

    expect(parseSubmission({ ...row, decision })?.decision?.acceptedAtTerm).toBe(true);
    expect(parseSubmission(row)?.decision?.acceptedAtTerm).toBe(false);
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

describe('latestSchoolFeedback (plan 80)', () => {
  const [base] = parseSubmissionsPage(recorded.mine)!;
  const row = (over: Partial<typeof base>) => ({ ...base, ...over });
  const teacher = row({
    attemptId: 'teacher',
    status: 'approved',
    decision: { ...base.decision!, by: 'teacher', at: '2026-10-22T10:00:00.000Z' },
  });

  it('takes a model’s provisional verdict at a school when it is the newest word', () => {
    const waiting = row({
      attemptId: 'waiting',
      status: 'pending',
      decision: null,
      provisional: { outcome: 'returned', comment: null, at: '2026-10-23T10:00:00.000Z', countsAt: null },
    });

    expect(latestSchoolFeedback([teacher, waiting], now)?.attemptId).toBe('waiting');
  });

  it('takes a model’s verdict at a school, not one on the work of a learner nobody reviews', () => {
    const atTerm = row({
      attemptId: 'term',
      schoolId: 'school-1',
      decision: { ...base.decision!, by: 'ai', byUserId: null, at: '2026-10-23T10:00:00.000Z', acceptedAtTerm: true },
    });
    const solo = row({ ...atTerm, attemptId: 'solo', schoolId: null });

    expect(latestSchoolFeedback([teacher, atTerm], now)?.attemptId).toBe('term');
    expect(latestSchoolFeedback([teacher, solo], now)?.attemptId).toBe('teacher');
  });

  it('reads plainly waiting work, and rows cached before plan 80, as nothing said yet', () => {
    const waiting = row({ attemptId: 'waiting', status: 'pending', decision: null, provisional: null });
    const cached = { ...waiting, provisional: undefined } as unknown as typeof base;

    expect(latestSchoolFeedback([waiting, cached], now)).toBeNull();
  });
});
