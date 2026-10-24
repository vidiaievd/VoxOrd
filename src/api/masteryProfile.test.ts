import { ApiError, apiClient } from './client';
import { recordedSubmissions as recorded } from './__fixtures__/submissionsRecorded';
import { getMasteryProfile, parseMasteryProfile } from './masteryProfile';
import { splitVerdicts } from '../lib/splitVerdicts';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
  ApiError: jest.requireActual('./client').ApiError,
}));

const mockGet = apiClient.get as jest.Mock;
const profile = recorded.mastery;

beforeEach(() => mockGet.mockReset());

describe('getMasteryProfile (recorded from dev)', () => {
  it('reads the learner’s profile from analytics, not learning-service', async () => {
    mockGet.mockResolvedValueOnce(profile);

    const result = (await getMasteryProfile())!;

    expect(result.weakest).toHaveLength(9);
    expect(result.insufficient).toHaveLength(11);
    expect(result.weakest[0]).toMatchObject({ skill: 'reading', focus: 'unknown', reason: 'forgets' });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/analytics/mastery/me', {
      query: { courseId: undefined, limit: undefined },
    });
  });

  it('gives block 11 the weak cells, weakest first', async () => {
    mockGet.mockResolvedValueOnce(profile);

    const { weak } = splitVerdicts((await getMasteryProfile())!.weakest);

    expect(weak.length).toBeGreaterThan(0);
    expect(weak.every((v) => v.successRateEwma < 0.8)).toBe(true);
    expect(weak[0].successRateEwma).toBeLessThanOrEqual(weak[1].successRateEwma);
  });

  it('throws when analytics is out of reach, so the cached profile stays', async () => {
    const down = new ApiError({ message: 'down', status: 503 });
    mockGet.mockRejectedValueOnce(down);

    await expect(getMasteryProfile()).rejects.toBe(down);
  });

  it('reads a refusal as nothing to say', async () => {
    mockGet.mockRejectedValueOnce(new ApiError({ message: 'no', status: 401 }));

    expect(await getMasteryProfile()).toBeNull();
  });
});

describe('parseMasteryProfile', () => {
  it('refuses the whole profile over one unreadable cell — never an emptier one', () => {
    const broken = { ...profile, weakest: [...profile.weakest, { ...profile.weakest[0], focus: 'spelling' }] };

    expect(parseMasteryProfile(broken)).toBeNull();
  });

  it('reads an absent reason as null, as the web does', () => {
    const noReason: Record<string, unknown> = { ...profile.weakest[0] };
    delete noReason.reason;

    expect(parseMasteryProfile({ ...profile, weakest: [noReason] })?.weakest[0].reason).toBeNull();
  });

  it('keeps an empty profile apart from no profile', () => {
    expect(parseMasteryProfile({ ...profile, weakest: [], insufficient: [] })).toMatchObject({
      weakest: [],
      insufficient: [],
    });
    expect(parseMasteryProfile({ ...profile, weakest: undefined })).toBeNull();
  });
});
