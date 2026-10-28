import { criterionNames, disputeAiReview, getAiReview, readReading } from './aiReview';
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
      reading: null,
      reviewedAt: '2026-10-24T10:00:00.000Z',
      disputedAt: null,
      provisional: false,
      countsAt: null,
      acceptedAtTerm: false,
    });
  });

  it('says a school’s review does not count yet, and when it will by itself (plan 80)', async () => {
    mockGet.mockResolvedValue({
      outcome: 'approved',
      items: [],
      summary: null,
      marks: null,
      reviewedAt: '2026-10-25T09:01:00.000Z',
      disputedAt: null,
      provisional: true,
      countsAt: '2026-11-01T09:00:00.000Z',
      acceptedAtTerm: false,
    });

    expect(await getAiReview('ex-1', 'att-1')).toMatchObject({
      provisional: true,
      countsAt: '2026-11-01T09:00:00.000Z',
      acceptedAtTerm: false,
    });
  });

  it('says a school’s review counted at the term', async () => {
    mockGet.mockResolvedValue({
      outcome: 'returned',
      items: [],
      summary: null,
      marks: null,
      reviewedAt: '2026-11-01T09:00:00.000Z',
      disputedAt: null,
      provisional: false,
      countsAt: '2026-11-01T09:00:00.000Z',
      acceptedAtTerm: true,
    });

    expect(await getAiReview('ex-1', 'att-1')).toMatchObject({
      provisional: false,
      countsAt: null,
      acceptedAtTerm: true,
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

/** As the engine keeps it on a `voice_review` review (`readingForView`). */
const ENGINE_READING = {
  passPercent: 85,
  prompts: [
    {
      itemId: 'p1',
      transcript: 'jeg bor på oslo',
      words: [{ text: 'jeg', startMs: 0, endMs: 300, confidence: 0.9 }],
      audioMs: 2400,
      pronunciation: null,
      check: {
        ops: [
          { k: 'read', i: 0, n: 1, heard: 'jeg', focus: false },
          { k: 'misread', i: 1, expected: 'i', heard: 'på', focus: true },
          { k: 'missed', i: 2, expected: 'nå', focus: false },
          { k: 'extra', heard: 'eh' },
          { k: 'shout', heard: 'ignored' },
        ],
        total: 3,
        read: 1,
        accuracy: 0.333,
      },
      percent: 33,
      passed: false,
      wordsPerMinute: 120,
    },
    { itemId: 'broken' },
  ],
  carriedItemIds: ['p0', 7],
};

describe('readReading (plan 82, step 12)', () => {
  it('copies what the screen draws and nothing else', () => {
    expect(readReading(ENGINE_READING)).toEqual({
      passPercent: 85,
      prompts: [
        {
          itemId: 'p1',
          transcript: 'jeg bor på oslo',
          ops: [
            { k: 'read', i: 0, n: 1, heard: 'jeg', focus: false },
            { k: 'misread', i: 1, expected: 'i', heard: 'på', focus: true },
            { k: 'missed', i: 2, expected: 'nå', focus: false },
            { k: 'extra', heard: 'eh' },
          ],
          total: 3,
          read: 1,
          percent: 33,
          passed: false,
          pronunciation: null,
          wordsPerMinute: 120,
        },
      ],
      carriedItemIds: ['p0'],
    });
  });

  it('keeps pronunciation scores and drops words it cannot read', () => {
    const reading = readReading({
      ...ENGINE_READING,
      prompts: [
        {
          ...ENGINE_READING.prompts[0],
          pronunciation: {
            accuracy: 80,
            fluency: 70,
            completeness: 90,
            words: [
              { text: 'jeg', accuracy: 92, error: 'none' },
              { text: 'bor', accuracy: 'high', error: 'none' },
              { text: 'i', accuracy: 30, error: 'whatever' },
            ],
          },
        },
      ],
    });
    expect(reading?.prompts[0]?.pronunciation).toEqual({
      accuracy: 80,
      fluency: 70,
      completeness: 90,
      prosody: null,
      words: [{ text: 'jeg', accuracy: 92, error: 'none' }],
    });
  });

  it('is null for anything that is not a reading', () => {
    expect(readReading(null)).toBeNull();
    expect(readReading(undefined)).toBeNull();
    expect(readReading({ prompts: [] })).toBeNull();
    expect(readReading([])).toBeNull();
  });

  it('comes through getAiReview', async () => {
    mockGet.mockResolvedValue({
      outcome: 'returned',
      items: [],
      summary: '1/3 · 33 % < 85 %',
      marks: null,
      reading: ENGINE_READING,
      reviewedAt: '2026-10-28T10:00:00.000Z',
      disputedAt: null,
    });
    const review = await getAiReview('ex-1', 'att-1');
    expect(review?.reading?.prompts.map(p => p.itemId)).toEqual(['p1']);
  });
});
