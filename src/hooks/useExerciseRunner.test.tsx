import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useExerciseRunner, type ExerciseRunnerController } from './useExerciseRunner';

const mockStartOrJoin = jest.fn();
const mockAnswerQuestion = jest.fn();
const mockCheckRow = jest.fn();
const mockRecentAttempts = jest.fn();
let mockTemplateCode: string | undefined;
jest.mock('../api/exercises', () => ({
  recentAttempts: (...args: unknown[]) => mockRecentAttempts(...args),
  isLocalAttempt: (id: string) => id.startsWith('offline:'),
  startOrJoinAttempt: (...args: unknown[]) => mockStartOrJoin(...args),
  answerQuestion: (...args: unknown[]) => mockAnswerQuestion(...args),
  checkRow: (...args: unknown[]) => mockCheckRow(...args),
  submitAttempt: jest.fn(),
}));

jest.mock('../lib/courseResources', () => ({
  exerciseDisplayResource: (exerciseId: string) => ({
    key: `exercise-display:${exerciseId}`,
    load: async () => ({ id: exerciseId, targetLanguage: 'nb', templateCode: mockTemplateCode }),
  }),
}));

jest.mock('../lib/swrCache', () => ({
  readCachedAny: async () => null,
  setMemoryCache: () => undefined,
  writeCacheSnapshot: async () => undefined,
}));

jest.mock('../i18n', () => ({ useUiLanguage: () => 'en' }));

let controller!: ExerciseRunnerController;
function Harness() {
  controller = useExerciseRunner(['ex-1'], 0);
  return null;
}

async function mountLoaded() {
  await act(async () => {
    ReactTestRenderer.create(<Harness />);
  });
  expect(controller.state.phase).not.toBe('loading');
}

describe('useExerciseRunner — the first move joins an attempt left open (OQ-48)', () => {
  beforeEach(() => {
    mockStartOrJoin.mockReset().mockResolvedValue({ attemptId: 'att-open' });
    mockAnswerQuestion.mockReset().mockResolvedValue({});
    mockCheckRow.mockReset().mockResolvedValue({});
  });

  it('a question handed in starts-or-joins, then answers onto that attempt', async () => {
    await mountLoaded();
    await act(async () => {
      await controller.answerQuestion('q-1', { text: 'svar' } as never);
    });
    expect(mockStartOrJoin).toHaveBeenCalledWith('ex-1', { language: 'nb', mode: 'PRACTICE' });
    expect(mockAnswerQuestion).toHaveBeenCalledWith('ex-1', 'att-open', {
      questionId: 'q-1',
      text: 'svar',
    });
  });

  it('a row check starts-or-joins as well', async () => {
    await mountLoaded();
    await act(async () => {
      await controller.checkRow('row-1', { a: ['x'] }, false);
    });
    expect(mockStartOrJoin).toHaveBeenCalledTimes(1);
    expect(mockCheckRow).toHaveBeenCalledWith('ex-1', 'att-open', {
      rowId: 'row-1',
      placement: { a: ['x'] },
      reveal: false,
    });
  });

  it('opens the attempt once for two quick moves', async () => {
    await mountLoaded();
    await act(async () => {
      await Promise.all([
        controller.answerQuestion('q-1', { text: 'a' } as never),
        controller.answerQuestion('q-2', { text: 'b' } as never),
      ]);
    });
    expect(mockStartOrJoin).toHaveBeenCalledTimes(1);
    expect(mockAnswerQuestion).toHaveBeenCalledTimes(2);
  });
});

describe('useExerciseRunner — work handed in before reopens on itself (OQ-S3 s19)', () => {
  const sent = {
    id: 'att-sent',
    status: 'ROUTED_FOR_REVIEW',
    templateCode: 'error_correction',
    submittedAnswer: { items: {} },
    draftAnswer: null,
    schoolId: 'school-1',
    aiFirst: true,
  };

  beforeEach(() => {
    mockStartOrJoin.mockReset().mockResolvedValue({ attemptId: 'att-new' });
    mockRecentAttempts.mockReset().mockResolvedValue([sent]);
  });
  afterEach(() => {
    mockTemplateCode = undefined;
  });

  it('opens an error_correction already with the teacher on that hand-in, starting nothing', async () => {
    mockTemplateCode = 'error_correction';
    await mountLoaded();
    expect(mockRecentAttempts).toHaveBeenCalledWith('ex-1', 10);
    expect(controller.state.phase).toBe('feedback');
    expect(controller.state.handedIn?.id).toBe('att-sent');
    expect(controller.state.verdict).toMatchObject({ requiresReview: true, reviewer: 'teacher', aiFirst: true });
    expect(mockStartOrJoin).not.toHaveBeenCalled();
  });

  it('opens a fresh attempt when nothing was handed in, or the history cannot be read', async () => {
    mockTemplateCode = 'writing_task';
    mockRecentAttempts.mockResolvedValue([{ ...sent, templateCode: 'writing_task', status: 'IN_PROGRESS' }]);
    await mountLoaded();
    expect(controller.state.phase).toBe('answering');

    mockRecentAttempts.mockRejectedValue(new Error('offline'));
    await mountLoaded();
    expect(controller.state.phase).toBe('answering');
  });

  it('does not ask about the past of a template checked on the spot', async () => {
    mockTemplateCode = 'multiple_choice';
    await mountLoaded();
    expect(mockRecentAttempts).not.toHaveBeenCalled();
    expect(controller.state.phase).toBe('answering');
  });
});
