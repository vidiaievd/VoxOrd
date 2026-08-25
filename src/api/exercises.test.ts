import { findOpenAttempt } from './exercises';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

beforeEach(() => mockGet.mockReset());

/**
 * `findOpenAttempt` is how a `short_answer` set picks itself back up (plan 51 §8 Q6).
 * It reads and never writes: opening an exercise and walking away must still create
 * nothing, so a set with nothing open is not an error but an empty answer.
 */
describe('findOpenAttempt', () => {
  it('asks only for the attempt still in progress', async () => {
    mockGet.mockResolvedValue({ items: [] });

    await findOpenAttempt('ex-1');

    expect(mockGet).toHaveBeenCalledWith('/api/v1/exercises/ex-1/attempts', {
      query: { status: 'IN_PROGRESS', limit: 1 },
    });
  });

  it('returns the open attempt with what has already been handed in', async () => {
    mockGet.mockResolvedValue({
      items: [
        {
          id: 'att-1',
          status: 'IN_PROGRESS',
          answeredQuestions: [{ questionId: 'q1', text: 'I tre år.', verdict: 'pass' }],
        },
      ],
    });

    await expect(findOpenAttempt('ex-1')).resolves.toEqual({
      attemptId: 'att-1',
      answeredQuestions: [{ questionId: 'q1', text: 'I tre år.', verdict: 'pass' }],
    });
  });

  it('reads an engine that does not send the field yet as nothing answered', async () => {
    mockGet.mockResolvedValue({ items: [{ id: 'att-1', status: 'IN_PROGRESS' }] });

    await expect(findOpenAttempt('ex-1')).resolves.toEqual({
      attemptId: 'att-1',
      answeredQuestions: [],
    });
  });

  it('has no open attempt when nothing is open', async () => {
    mockGet.mockResolvedValue({ items: [] });

    await expect(findOpenAttempt('ex-1')).resolves.toBeNull();
  });

  // Failing soft is the point: a set that cannot be resumed is played from the top,
  // which is what happened before there was anything to resume.
  it('says nothing is open when the request fails', async () => {
    mockGet.mockRejectedValue(new Error('offline'));

    await expect(findOpenAttempt('ex-1')).resolves.toBeNull();
  });
});
