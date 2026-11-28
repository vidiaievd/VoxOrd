import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useExerciseRunner, type ExerciseRunnerController } from './useExerciseRunner';

const mockStartOrJoin = jest.fn();
const mockAnswerQuestion = jest.fn();
const mockCheckRow = jest.fn();
jest.mock('../api/exercises', () => ({
  startOrJoinAttempt: (...args: unknown[]) => mockStartOrJoin(...args),
  answerQuestion: (...args: unknown[]) => mockAnswerQuestion(...args),
  checkRow: (...args: unknown[]) => mockCheckRow(...args),
  submitAttempt: jest.fn(),
}));

jest.mock('../lib/courseResources', () => ({
  exerciseDisplayResource: (exerciseId: string) => ({
    key: `exercise-display:${exerciseId}`,
    load: async () => ({ id: exerciseId, targetLanguage: 'nb' }),
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
