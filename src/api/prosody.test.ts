import { getExerciseProsody, getLessonProsody } from './prosody';
import { apiClient } from './client';
import { emptyProsodyLayer } from '../kernel/prosody';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;
const layer = emptyProsodyLayer();

describe('prosody api', () => {
  beforeEach(() => mockGet.mockReset());

  it('keys exercise layers by prompt id and defaults sounds to empty', async () => {
    mockGet.mockResolvedValue({
      prompts: [{ promptId: 'p1', text: 'Hei på deg', layer }],
    });
    const out = await getExerciseProsody('ex-1');
    expect(mockGet).toHaveBeenCalledWith('/api/v1/exercises/ex-1/prosody');
    expect(out).toEqual({ p1: { text: 'Hei på deg', layer, sounds: [] } });
  });

  it('keys lesson layers by paragraph index', async () => {
    mockGet.mockResolvedValue({
      paragraphs: [{ paragraphIndex: 2, text: 'Hei', layer, sounds: [] }],
    });
    const out = await getLessonProsody('l-1', 'v-1');
    expect(mockGet).toHaveBeenCalledWith('/api/v1/lessons/l-1/variants/v-1/prosody');
    expect(Object.keys(out)).toEqual(['2']);
  });

  it('drops entries it cannot draw and tolerates a malformed body', async () => {
    mockGet.mockResolvedValue({
      prompts: [
        { promptId: 'a', text: 'x', layer: { stresses: 1 } },
        { promptId: 'b', layer },
        null,
      ],
    });
    expect(await getExerciseProsody('ex')).toEqual({});
    mockGet.mockResolvedValue('nope');
    expect(await getLessonProsody('l', 'v')).toEqual({});
  });

  it('lets a network failure through so a cached layer is kept', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(getExerciseProsody('ex')).rejects.toThrow('offline');
  });
});
