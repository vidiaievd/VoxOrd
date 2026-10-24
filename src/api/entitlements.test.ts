import { ApiError, apiClient } from './client';
import { recordedGateway, SCHOOL_ID } from './__fixtures__/todayRecorded.router';
import {
  getEntitlements,
  getLearnerEntitlements,
  isExpired,
  mergeEntitlements,
  parseEntitlements,
  type Entitlements,
} from './entitlements';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
  ApiError: jest.requireActual('./client').ApiError,
}));

const mockGet = apiClient.get as jest.Mock;

beforeEach(() => mockGet.mockReset());

describe('getEntitlements (recorded from dev)', () => {
  it("reads the learner's own rights field by field, without plan or account", async () => {
    mockGet.mockImplementation(recordedGateway());
    expect(await getEntitlements()).toEqual({
      features: {
        'ai.practice': { enabled: true, monthlyCredits: '20' },
        'ai.review_direct': { enabled: false, monthlyCredits: null },
        'ai.student_assist': { enabled: true, monthlyCredits: '20' },
      },
      validUntil: '2026-11-01T00:00:00.000Z',
    });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/subscriptions/me', { query: undefined });
  });

  it("a school learner runs on the school's rights", async () => {
    mockGet.mockImplementation(recordedGateway());
    const e = await getLearnerEntitlements([SCHOOL_ID]);
    expect(mockGet).toHaveBeenCalledWith('/api/v1/subscriptions/me', { query: { workspaceId: SCHOOL_ID } });
    expect(e?.features['ai.review_draft']).toEqual({ enabled: true, monthlyCredits: '50' });
    expect(e?.features['ai.student_assist']).toEqual({ enabled: false, monthlyCredits: null });
  });

  it('a refusal or a malformed answer is no rights; out of reach throws so the cache stays', async () => {
    mockGet.mockRejectedValueOnce(new ApiError({ message: 'not a member', status: 403 }));
    expect(await getEntitlements(SCHOOL_ID)).toBeNull();

    mockGet.mockResolvedValueOnce({ features: [], validUntil: 'soon' });
    expect(await getEntitlements()).toBeNull();

    const down = new ApiError({ message: 'membership not checked', status: 503 });
    mockGet.mockRejectedValueOnce(down);
    await expect(getEntitlements(SCHOOL_ID)).rejects.toBe(down);
  });

  it('skips a feature that is not one, keeps the rest', () => {
    expect(
      parseEntitlements({
        features: { 'ai.practice': { enabled: 'yes' }, 'ai.authoring': { enabled: true, monthlyCredits: 5 } },
        validUntil: '2026-11-01T00:00:00.000Z',
      }),
    ).toEqual({
      features: { 'ai.authoring': { enabled: true, monthlyCredits: null } },
      validUntil: '2026-11-01T00:00:00.000Z',
    });
  });
});

describe('mergeEntitlements', () => {
  const school = (features: Entitlements['features'], validUntil: string): Entitlements => ({ features, validUntil });

  it('a key is on when any school has it, with the larger allowance; good until the first changes', () => {
    const merged = mergeEntitlements([
      school(
        {
          'ai.review_draft': { enabled: true, monthlyCredits: '50' },
          'ai.student_assist': { enabled: false, monthlyCredits: null },
        },
        '2026-11-01T00:00:00.000Z',
      ),
      school(
        {
          'ai.review_draft': { enabled: true, monthlyCredits: '200' },
          'ai.student_assist': { enabled: true, monthlyCredits: '10' },
        },
        '2026-10-28T00:00:00.000Z',
      ),
    ]);
    expect(merged).toEqual({
      features: {
        'ai.review_draft': { enabled: true, monthlyCredits: '200' },
        'ai.student_assist': { enabled: true, monthlyCredits: '10' },
      },
      validUntil: '2026-10-28T00:00:00.000Z',
    });
  });

  it('unmetered beats any number', () => {
    const merged = mergeEntitlements([
      school({ 'ai.review_draft': { enabled: true, monthlyCredits: '50' } }, '2026-11-01T00:00:00.000Z'),
      school({ 'ai.review_draft': { enabled: true, monthlyCredits: null } }, '2026-11-01T00:00:00.000Z'),
    ]);
    expect(merged?.features['ai.review_draft']?.monthlyCredits).toBeNull();
  });

  it('no school answering is no rights', async () => {
    expect(mergeEntitlements([])).toBeNull();
    mockGet.mockRejectedValue(new ApiError({ message: 'no', status: 403 }));
    expect(await getLearnerEntitlements([SCHOOL_ID])).toBeNull();
  });
});

describe('isExpired', () => {
  it('is past validUntil', () => {
    const e: Entitlements = { features: {}, validUntil: '2026-11-01T00:00:00.000Z' };
    expect(isExpired(e, new Date('2026-10-31T23:59:59.000Z'))).toBe(false);
    expect(isExpired(e, new Date('2026-11-01T00:00:00.000Z'))).toBe(true);
  });
});
