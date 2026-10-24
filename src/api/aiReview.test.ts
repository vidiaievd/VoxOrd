import { criterionNames, disputeAiReview, getAiReview } from './aiReview';
import { ApiError, apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  ApiError: jest.requireActual('./client').ApiError,
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

const PATH = '/api/v1/exercises/ex-1/attempts/att-1/ai-review';

describe('getAiReview (plan 79, 2.3d)', () => {
  it('reads the review field by field, so nothing added upstream reaches the screen', async () => {
    mockGet.mockResolvedValue({
      outcome: 'returned',
      items: [
        { itemId: 'i1', sentenceIndex: 0, aspect: 'grammar', fragment: 'har gå', comment: 'c', suggestion: 'har gått', model: 'x' },
        { itemId: 'i2', sentenceIndex: 1, aspect: 'task', comment: 'whole' },
      ],
      summary: 'Two slips.',
      marks: [{ criterionId: 'c1', mark: 2, reason: 'r', promptVersion: 'v' }],
      reviewedAt: '2026-10-24T10:00:00.000Z',
      disputedAt: null,
      modelId: 'secret',
    });

    const review = await getAiReview('ex-1', 'att-1');

    expect(mockGet).toHaveBeenCalledWith(PATH);
    expect(review).toEqual({
      outcome: 'returned',
      items: [
        { itemId: 'i1', sentenceIndex: 0, aspect: 'grammar', fragment: 'har gå', comment: 'c', suggestion: 'har gått' },
        { itemId: 'i2', sentenceIndex: 1, aspect: 'task', fragment: null, comment: 'whole', suggestion: null },
      ],
      summary: 'Two slips.',
      marks: [{ criterionId: 'c1', mark: 2, reason: 'r' }],
      reviewedAt: '2026-10-24T10:00:00.000Z',
      disputedAt: null,
    });
  });

  it('answers null when no model reviewed the attempt', async () => {
    mockGet.mockRejectedValue(new ApiError({ message: 'No model reviewed this submission', status: 404, code: 'NO_AI_REVIEW' }));
    await expect(getAiReview('ex-1', 'att-1')).resolves.toBeNull();
  });

  it('lets every other failure through', async () => {
    mockGet.mockRejectedValue(new ApiError({ message: 'down', status: 502 }));
    await expect(getAiReview('ex-1', 'att-1')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('disputeAiReview', () => {
  it('sends the reason trimmed, and no reason for an empty box', async () => {
    mockPost.mockResolvedValue({ disputedAt: '2026-10-24T11:00:00.000Z' });

    await disputeAiReview('ex-1', 'att-1', '  Sentence 2 is fine. ');
    await disputeAiReview('ex-1', 'att-1', '   ');

    expect(mockPost).toHaveBeenNthCalledWith(1, `${PATH}/dispute`, { reason: 'Sentence 2 is fine.' });
    expect(mockPost).toHaveBeenNthCalledWith(2, `${PATH}/dispute`, {});
  });
});

describe('criterionNames', () => {
  it('names the criteria of the frozen rubric, in its order', () => {
    const names = criterionNames({
      criteria: [
        { id: 'c2', name: 'Task', descriptors: ['…'] },
        { id: 'c1' },
        { name: 'no id' },
      ],
    });
    expect([...names]).toEqual([
      ['c2', 'Task'],
      ['c1', ''],
    ]);
  });

  it('is empty for anything that is not a rubric', () => {
    expect(criterionNames(null).size).toBe(0);
    expect(criterionNames({ criteria: 'x' }).size).toBe(0);
  });
});
