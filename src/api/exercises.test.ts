import { answerQuestion, checkRow, findOpenAttempt } from './exercises';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

/**
 * `findOpenAttempt` is how a `short_answer` set picks itself back up (plan 51 §8 Q6), a
 * `sentence_schema` set with it (plan 52) and a `multiple_choice` set after them (plan
 * 53): all three take work onto the attempt before it closes, so all three leave
 * something to come back to.
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
      checkedRows: [],
      pickedOptions: [],
    });
  });

  it('returns the sentences already checked, and whether each was shown or solved', async () => {
    const checked = {
      rowId: 'r1',
      attempts: 2,
      placement: { forfelt: ['c1'], verbal: ['c2'] },
      solved: false,
      revealed: true,
    };
    mockGet.mockResolvedValue({
      items: [{ id: 'att-1', status: 'IN_PROGRESS', checkedRows: [checked] }],
    });

    await expect(findOpenAttempt('ex-1')).resolves.toEqual({
      attemptId: 'att-1',
      answeredQuestions: [],
      checkedRows: [checked],
      pickedOptions: [],
    });
  });

  it('returns the questions already picked at, with the tries they cost', async () => {
    const picked = {
      questionId: 'q1',
      picks: ['o2', 'o1'],
      eliminated: ['o3'],
      correct: true,
      closed: true,
      revealed: false,
    };
    mockGet.mockResolvedValue({
      items: [{ id: 'att-1', status: 'IN_PROGRESS', pickedOptions: [picked] }],
    });

    await expect(findOpenAttempt('ex-1')).resolves.toEqual({
      attemptId: 'att-1',
      answeredQuestions: [],
      checkedRows: [],
      pickedOptions: [picked],
    });
  });

  it('reads an engine that does not send the field yet as nothing answered', async () => {
    mockGet.mockResolvedValue({ items: [{ id: 'att-1', status: 'IN_PROGRESS' }] });

    await expect(findOpenAttempt('ex-1')).resolves.toEqual({
      attemptId: 'att-1',
      answeredQuestions: [],
      checkedRows: [],
      pickedOptions: [],
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

/**
 * Checking one sentence of a `sentence_schema` set (plan 52 §3.3). Repeatable, unlike
 * handing in an answer: only a sentence already solved or shown is refused.
 */
describe('checkRow', () => {
  it('posts the board onto the open attempt', async () => {
    mockPost.mockResolvedValue({ attemptId: 'att-1', closed: 1, total: 4, result: {} });

    await checkRow('ex-1', 'att-1', {
      rowId: 'r1',
      placement: { forfelt: ['c1'], verbal: ['c2'] },
      reveal: false,
    });

    expect(mockPost).toHaveBeenCalledWith('/api/v1/exercises/ex-1/attempts/att-1/rows', {
      rowId: 'r1',
      placement: { forfelt: ['c1'], verbal: ['c2'] },
      reveal: false,
    });
  });
});

/**
 * Handing in one item of a set. One route, two templates: what the body carries is what
 * decides which judge runs on the server, and this module sends it through untouched
 * rather than naming the kind itself (plan 53 §3.3).
 */
describe('answerQuestion', () => {
  it('posts a written answer onto the open attempt', async () => {
    mockPost.mockResolvedValue({ attemptId: 'att-1', answered: 1, total: 4, result: {} });

    await answerQuestion('ex-1', 'att-1', { questionId: 'q1', text: 'I tre år.' });

    expect(mockPost).toHaveBeenCalledWith('/api/v1/exercises/ex-1/attempts/att-1/answers', {
      questionId: 'q1',
      text: 'I tre år.',
    });
  });

  it('posts a picked option the same way', async () => {
    mockPost.mockResolvedValue({ attemptId: 'att-1', answered: 1, total: 5, result: {} });

    await answerQuestion('ex-1', 'att-1', { questionId: 'q1', optionId: 'o2' });

    expect(mockPost).toHaveBeenCalledWith('/api/v1/exercises/ex-1/attempts/att-1/answers', {
      questionId: 'q1',
      optionId: 'o2',
    });
  });

  // «Vis svaret» hands in nothing, and says so: without `reveal` the engine refuses an
  // empty pick rather than guessing that the learner meant to close the question.
  it('sends «show the answer» as a pick of nothing', async () => {
    mockPost.mockResolvedValue({ attemptId: 'att-1', answered: 1, total: 5, result: {} });

    await answerQuestion('ex-1', 'att-1', { questionId: 'q1', optionId: null, reveal: true });

    expect(mockPost).toHaveBeenCalledWith('/api/v1/exercises/ex-1/attempts/att-1/answers', {
      questionId: 'q1',
      optionId: null,
      reveal: true,
    });
  });
});
