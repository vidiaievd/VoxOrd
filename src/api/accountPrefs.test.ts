import { apiClient } from './client';
import {
  getAccountPrefs,
  parseAccountPrefs,
  patchAccountPrefs,
} from './accountPrefs';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), patch: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;

describe('parseAccountPrefs', () => {
  it('reads both fields', () => {
    expect(
      parseAccountPrefs({ dailyGoalMin: 15, translationLanguage: 'uk' }),
    ).toEqual({ dailyGoalMin: 15, translationLanguage: 'uk' });
  });

  it('reads nulls, unknown languages and odd goals as «not chosen»', () => {
    expect(
      parseAccountPrefs({ dailyGoalMin: null, translationLanguage: null }),
    ).toEqual({ dailyGoalMin: null, translationLanguage: null });
    expect(
      parseAccountPrefs({ dailyGoalMin: 2.5, translationLanguage: 'de' }),
    ).toEqual({ dailyGoalMin: null, translationLanguage: null });
    expect(parseAccountPrefs('nope')).toEqual({
      dailyGoalMin: null,
      translationLanguage: null,
    });
  });
});

describe('requests', () => {
  it('reads and patches the student preferences', async () => {
    mockGet.mockResolvedValueOnce({ dailyGoalMin: 10, translationLanguage: null });
    await expect(getAccountPrefs()).resolves.toEqual({
      dailyGoalMin: 10,
      translationLanguage: null,
    });
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v1/profiles/me/student/preferences',
    );

    mockPatch.mockResolvedValueOnce({ dailyGoalMin: 20, translationLanguage: 'en' });
    await expect(patchAccountPrefs({ dailyGoalMin: 20 })).resolves.toEqual({
      dailyGoalMin: 20,
      translationLanguage: 'en',
    });
    expect(mockPatch).toHaveBeenCalledWith(
      '/api/v1/profiles/me/student/preferences',
      { dailyGoalMin: 20 },
    );
  });
});
