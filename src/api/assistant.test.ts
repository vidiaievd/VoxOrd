import { ApiError, apiClient } from './client';
import {
  applyToDraft,
  AssistEventReader,
  contextFields,
  contextKey,
  getAvailability,
  getMyAiUsage,
  historyToSend,
  parseAnswer,
  parseUsage,
  sendFeedback,
  sendMessage,
  HISTORY_MAX_CHARS,
  HISTORY_MAX_TURNS,
  MESSAGE_MAX,
  type AssistTurn,
} from './assistant';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), stream: jest.fn() },
  ApiError: jest.requireActual('./client').ApiError,
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockStream = apiClient.stream as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockStream.mockReset();
});

const apiError = (status: number | null, body?: unknown, code?: string) =>
  new ApiError({ message: 'x', status, body, code: code ?? (status === null ? 'NETWORK_ERROR' : null) });

const unit = { kind: 'unit', courseId: 'c1', unitId: 'u1' } as const;

/** An answer as plan 83 §3 describes it, with the mockup's «Da **kom** han hjem». */
const answer = {
  callId: 'call-1',
  blocks: [
    { type: 'text', text: 'Etter «da» står verbet foran subjektet.' },
    { type: 'example', text: 'Da kom han hjem', emphasis: [[3, 6]] },
  ],
  citations: [{ kind: 'grammar_rule', id: 'r1', title: 'Inversjon', unitId: 'u1', courseId: 'c1' }],
  suggestions: [
    { kind: 'ask', text: 'Gi meg et eksempel til' },
    { kind: 'add_word', lemma: 'hjem', translation: 'домой' },
    { kind: 'open', target: { kind: 'lesson', id: 'l1', title: 'Tekst 1' } },
  ],
  model: 'never reaches the screen',
};

describe('context', () => {
  it('sends only the ids its kind carries', () => {
    expect(contextFields(unit)).toEqual({ kind: 'unit', courseId: 'c1', unitId: 'u1' });
    expect(contextFields({ kind: 'free' })).toEqual({ kind: 'free' });
    expect(contextFields({ kind: 'class', lessonId: 'cl1', courseId: undefined })).toEqual({
      kind: 'class',
      lessonId: 'cl1',
    });
  });

  it('keys the same context the same way whatever the field order', () => {
    expect(contextKey({ kind: 'unit', unitId: 'u1', courseId: 'c1' })).toBe(contextKey(unit));
    expect(contextKey(unit)).toBe('unit:courseId=c1:unitId=u1');
    expect(contextKey({ kind: 'free' })).toBe('free');
  });
});

describe('parseAnswer', () => {
  it('copies the answer field by field', () => {
    expect(parseAnswer(answer)).toEqual({
      callId: 'call-1',
      blocks: [
        { type: 'text', text: 'Etter «da» står verbet foran subjektet.', emphasis: [] },
        { type: 'example', text: 'Da kom han hjem', emphasis: [[3, 6]] },
      ],
      citations: [
        { kind: 'grammar_rule', id: 'r1', title: 'Inversjon', unitId: 'u1', courseId: 'c1' },
      ],
      suggestions: [
        { kind: 'ask', text: 'Gi meg et eksempel til' },
        { kind: 'add_word', lemma: 'hjem', translation: 'домой' },
        {
          kind: 'open',
          target: { kind: 'lesson', id: 'l1', title: 'Tekst 1', unitId: null, courseId: null },
        },
      ],
    });
  });

  it('is no answer without a callId or without a block that reads', () => {
    expect(parseAnswer({ ...answer, callId: undefined })).toBeNull();
    expect(parseAnswer({ ...answer, blocks: [] })).toBeNull();
    expect(parseAnswer({ ...answer, blocks: [{ type: 'table', text: 'x' }, { type: 'text', text: '  ' }] })).toBeNull();
    expect(parseAnswer('Da kom han hjem')).toBeNull();
    expect(parseAnswer(null)).toBeNull();
  });

  it('drops a block, citation or suggestion it cannot use and keeps the rest', () => {
    const parsed = parseAnswer({
      ...answer,
      blocks: [...answer.blocks, { type: 'audio', text: 'x' }],
      citations: [...answer.citations, { kind: 'video', id: 'v', title: 't' }, { kind: 'lesson', title: 'no id' }],
      suggestions: [...answer.suggestions, { kind: 'buy', text: 'x' }, { kind: 'add_word', lemma: '' }],
    });
    expect(parsed?.blocks).toHaveLength(2);
    expect(parsed?.citations).toHaveLength(1);
    expect(parsed?.suggestions).toHaveLength(3);
  });

  it('stresses nothing a range cannot point at', () => {
    const parsed = parseAnswer({
      callId: 'c',
      blocks: [
        { type: 'example', text: 'Da kom han hjem', emphasis: [[3, 6], [4, 8], [10, 99], [7, 7], ['a', 2], [11, 15]] },
      ],
    });
    expect(parsed?.blocks[0].emphasis).toEqual([[3, 6], [11, 15]]);
  });
});

describe('historyToSend', () => {
  const turn = (i: number, length = 10): AssistTurn => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: String(i).padEnd(length, '.'),
  });

  it('sends the newest turns, no more than the server takes', () => {
    const turns = Array.from({ length: 25 }, (_, i) => turn(i));
    const sent = historyToSend(turns);
    expect(sent).toHaveLength(HISTORY_MAX_TURNS);
    expect(sent[sent.length - 1]).toEqual(turns[24]);
    expect(sent[0]).toEqual(turns[15]);
  });

  it('stops before a turn that does not fit whole', () => {
    const turns = [turn(0, 100), turn(1, HISTORY_MAX_CHARS - 50), turn(2, 40)];
    expect(historyToSend(turns)).toEqual([turns[1], turns[2]]);
    expect(historyToSend([turn(0, HISTORY_MAX_CHARS + 1)])).toEqual([]);
  });
});

describe('getAvailability', () => {
  it('asks with the context as query', async () => {
    mockGet.mockResolvedValue({ available: true, reason: 'quota' });
    expect(await getAvailability(unit)).toEqual({ available: true, reason: null });
    expect(mockGet).toHaveBeenCalledWith('/api/v1/ai/assist/availability', {
      query: { kind: 'unit', courseId: 'c1', unitId: 'u1' },
    });
  });

  it('reads a known reason and forgets an unknown one', async () => {
    mockGet.mockResolvedValueOnce({ available: false, reason: 'quota' });
    expect(await getAvailability(unit)).toEqual({ available: false, reason: 'quota' });
    mockGet.mockResolvedValueOnce({ available: false, reason: 'moon_phase' });
    expect(await getAvailability(unit)).toEqual({ available: false, reason: null });
  });

  it('is closed on a refusal or an answer that does not read', async () => {
    mockGet.mockRejectedValueOnce(apiError(403));
    expect(await getAvailability(unit)).toEqual({ available: false, reason: null });
    mockGet.mockResolvedValueOnce({ available: 'yes' });
    expect(await getAvailability(unit)).toEqual({ available: false, reason: null });
  });

  it('throws out of reach, so a cached answer stays', async () => {
    mockGet.mockRejectedValueOnce(apiError(null));
    await expect(getAvailability(unit)).rejects.toBeInstanceOf(ApiError);
    mockGet.mockRejectedValueOnce(apiError(502));
    await expect(getAvailability(unit)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('sendMessage', () => {
  it('sends the context, the tail of the thread and the trimmed message', async () => {
    mockPost.mockResolvedValue(answer);
    const outcome = await sendMessage(unit, [{ role: 'user', text: 'hei' }], `  ${'x'.repeat(MESSAGE_MAX + 5)}  `);
    expect(outcome.kind).toBe('answer');
    const [path, body, options] = mockPost.mock.calls[0];
    expect(path).toBe('/api/v1/ai/assist/messages');
    expect(body).toEqual({
      context: { kind: 'unit', courseId: 'c1', unitId: 'u1' },
      history: [{ role: 'user', text: 'hei' }],
      message: 'x'.repeat(MESSAGE_MAX),
    });
    expect(options.timeoutMs).toBeGreaterThan(15000);
  });

  it.each([
    [apiError(409, { reason: 'quota' }), { kind: 'refused', reason: 'quota' }],
    [apiError(409, { reason: 'whatever' }), { kind: 'refused', reason: null }],
    [apiError(403), { kind: 'refused', reason: null }],
    [apiError(429), { kind: 'rate_limited' }],
    [apiError(503), { kind: 'silent' }],
    [apiError(500), { kind: 'silent' }],
    [apiError(null, undefined, 'TIMEOUT'), { kind: 'silent' }],
    [apiError(null), { kind: 'unreachable' }],
    [new Error('boom'), { kind: 'silent' }],
  ])('maps a failure to an outcome (%#)', async (error, expected) => {
    mockPost.mockRejectedValue(error);
    expect(await sendMessage(unit, [], 'hei')).toEqual(expected);
  });

  it('a malformed answer is silence, never invented text', async () => {
    mockPost.mockResolvedValue({ callId: 'c', text: 'something the model said' });
    expect(await sendMessage(unit, [], 'hei')).toEqual({ kind: 'silent' });
  });
});

/** One server-sent event as ai-service writes it. */
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe('AssistEventReader', () => {
  it('reads frames cut anywhere, with CRLF, skipping comments, unknown events and bad data', () => {
    const reader = new AssistEventReader();
    const text =
      ': keep-alive\r\n\r\n' +
      sse('delta', { block: 0, text: 'Verbet ' }).replace(/\n/g, '\r\n') +
      sse('ping', {}) +
      'event: delta\ndata: not json\n\n' +
      sse('delta', { block: 0, type: 'text', text: 'står' }) +
      sse('reset', {}) +
      sse('refused', { reason: 'quota' });
    const events = [];
    for (let i = 0; i < text.length; i += 7) events.push(...reader.feed(text.slice(i, i + 7)));
    expect(events).toEqual([
      { kind: 'delta', block: 0, type: null, text: 'Verbet ' },
      { kind: 'delta', block: 0, type: 'text', text: 'står' },
      { kind: 'reset' },
      { kind: 'refused', reason: 'quota' },
    ]);
  });

  it('drops a delta with no block it can place', () => {
    const reader = new AssistEventReader();
    expect(reader.feed(sse('delta', { block: -1, text: 'x' }) + sse('delta', { block: 999, text: 'x' }))).toEqual([]);
  });
});

describe('applyToDraft', () => {
  it('appends to its block, learns the type once, and empties on reset', () => {
    let draft = applyToDraft([], { kind: 'delta', block: 1, type: null, text: 'Da ' });
    draft = applyToDraft(draft, { kind: 'delta', block: 1, type: 'example', text: 'kom' });
    expect(draft).toEqual([
      { type: null, text: '' },
      { type: 'example', text: 'Da kom' },
    ]);
    expect(applyToDraft(draft, { kind: 'reset' })).toEqual([]);
  });
});

describe('sendMessage streamed', () => {
  /** The server streams `text` in pieces of `size`, then the response ends. */
  const streams = (text: string, size = 11) =>
    mockStream.mockImplementation(async (_path, options) => {
      for (let i = 0; i < text.length; i += size) options.onText(text.slice(i, i + size));
      return { streamed: true, body: undefined };
    });

  it('asks with stream=1, shows the text as it comes, and ends with the checked answer', async () => {
    streams(
      sse('delta', { block: 0, type: 'text', text: 'Etter «da» ' }) +
        sse('delta', { block: 0, text: 'står verbet' }) +
        sse('answer', answer),
    );
    const drafts: unknown[] = [];
    const outcome = await sendMessage(unit, [], 'hei', (d) => drafts.push(d));

    const [path, options] = mockStream.mock.calls[0];
    expect(path).toBe('/api/v1/ai/assist/messages');
    expect(options.query).toEqual({ stream: 1 });
    expect(options.body.message).toBe('hei');
    expect(drafts).toEqual([
      [{ type: 'text', text: 'Etter «da» ' }],
      [{ type: 'text', text: 'Etter «da» står verbet' }],
    ]);
    expect(outcome.kind).toBe('answer');
    if (outcome.kind === 'answer') expect(outcome.answer.blocks[1].emphasis).toEqual([[3, 6]]);
  });

  it.each([
    [sse('refused', { reason: 'quota' }), { kind: 'refused', reason: 'quota' }],
    [sse('unavailable', {}), { kind: 'silent' }],
    ['', { kind: 'silent' }],
    [sse('answer', { callId: 'c', text: 'not an answer' }), { kind: 'silent' }],
  ])('drops the streamed text when the turn ends otherwise (%#)', async (ending, expected) => {
    streams(sse('delta', { block: 0, text: 'Verbet står' }) + ending);
    expect(await sendMessage(unit, [], 'hei', () => undefined)).toEqual(expected);
  });

  it('reads a turn the server did not stream as JSON', async () => {
    mockStream.mockResolvedValue({ streamed: false, body: answer });
    expect((await sendMessage(unit, [], 'hei', () => undefined)).kind).toBe('answer');
  });

  it('maps a failure before the stream as without it', async () => {
    mockStream.mockRejectedValue(apiError(429));
    expect(await sendMessage(unit, [], 'hei', () => undefined)).toEqual({ kind: 'rate_limited' });
  });

  it('keeps the closing answer when the connection breaks after it', async () => {
    mockStream.mockImplementation(async (_path, options) => {
      options.onText(sse('answer', answer));
      throw apiError(null);
    });
    expect((await sendMessage(unit, [], 'hei', () => undefined)).kind).toBe('answer');
  });

  it('a connection broken mid-answer is the server out of reach, its text dropped', async () => {
    mockStream.mockImplementation(async (_path, options) => {
      options.onText(sse('delta', { block: 0, text: 'Verbet' }));
      throw apiError(null);
    });
    expect(await sendMessage(unit, [], 'hei', () => undefined)).toEqual({ kind: 'unreachable' });
  });
});

describe('sendFeedback', () => {
  it('sends the reason trimmed, or not at all', async () => {
    mockPost.mockResolvedValue(undefined);
    expect(await sendFeedback('call-1', false, '  wrong rule  ')).toBe(true);
    expect(mockPost).toHaveBeenLastCalledWith('/api/v1/ai/assist/feedback', {
      callId: 'call-1',
      helpful: false,
      reason: 'wrong rule',
    });
    await sendFeedback('call-1', true, '   ');
    expect(mockPost).toHaveBeenLastCalledWith('/api/v1/ai/assist/feedback', { callId: 'call-1', helpful: true });
  });

  it('a repeat is the first press counted; a failure is not kept', async () => {
    mockPost.mockRejectedValueOnce(apiError(409));
    expect(await sendFeedback('call-1', true)).toBe(true);
    mockPost.mockRejectedValueOnce(apiError(null));
    expect(await sendFeedback('call-1', true)).toBe(false);
  });
});

describe('usage', () => {
  const usage = { feature: 'ai.review_direct', used: '3', total: '20', periodEnd: '2026-11-01T00:00:00.000Z' };

  it('reads used and total as decimal strings, null total as unmetered', () => {
    expect(parseUsage({ ...usage, extra: 1 })).toEqual(usage);
    expect(parseUsage({ ...usage, total: null })).toEqual({ ...usage, total: null });
  });

  it('is nothing when a field does not read', () => {
    expect(parseUsage({ ...usage, used: 3 })).toBeNull();
    expect(parseUsage({ ...usage, total: 'lots' })).toBeNull();
    expect(parseUsage({ ...usage, total: undefined })).toBeNull();
    expect(parseUsage({ ...usage, periodEnd: 'soon' })).toBeNull();
  });

  it('asks for one feature; null on a refusal, throws out of reach', async () => {
    mockGet.mockResolvedValueOnce(usage);
    expect(await getMyAiUsage('ai.review_direct')).toEqual(usage);
    expect(mockGet).toHaveBeenCalledWith('/api/v1/ai/usage/me', { query: { feature: 'ai.review_direct' } });
    mockGet.mockRejectedValueOnce(apiError(403));
    expect(await getMyAiUsage('ai.review_direct')).toBeNull();
    mockGet.mockRejectedValueOnce(apiError(503));
    await expect(getMyAiUsage('ai.review_direct')).rejects.toBeInstanceOf(ApiError);
  });
});
