import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useQuiz } from './useQuiz';

/**
 * Regression: Deep Session opened two `learning_sessions` rows per phase.
 *
 * The setup effect creates the session row, and it was keyed on the override
 * ids as written. Deep Session re-fetches its words per phase with
 * `ORDER BY RANDOM()`, so the same set arrived reshuffled, the key changed and
 * the effect re-ran — leaving an empty, never-finished row behind.
 *
 * `useListening` and `useSpelling` are the same code; this covers the shape.
 */

const mockCreate = jest.fn();
const mockGetQuestions = jest.fn();

jest.mock('../repositories/SessionRepository', () => ({
  sessionRepository: {
    create: (...args: unknown[]) => mockCreate(...args),
    finish: jest.fn(),
    recordResult: jest.fn(),
  },
}));

jest.mock('../repositories/QuizRepository', () => ({
  quizRepository: {
    getQuestionsForDeck: (...args: unknown[]) => mockGetQuestions(...args),
  },
}));

jest.mock('../repositories/WordModeStrengthRepository', () => ({
  wordModeStrengthRepository: { recordAnswer: jest.fn() },
}));

const question = (wordId: number) => ({
  wordId,
  word:          `word${wordId}`,
  correctAnswer: `translation${wordId}`,
  options:       ['a', 'b', 'c', `translation${wordId}`],
});

/** Renders `useQuiz` and lets its async setup settle. */
async function renderQuiz(wordIds: number[]) {
  function Probe({ ids }: { ids: number[] }) {
    useQuiz(1, ids);
    return null;
  }

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Probe ids={wordIds} />);
  });

  return async (ids: number[]) => {
    await act(async () => {
      renderer.update(<Probe ids={ids} />);
    });
  };
}

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue(1);
  mockGetQuestions.mockReset().mockResolvedValue([1, 2, 3].map(question));
});

describe('useQuiz session setup', () => {
  it('opens exactly one session for a given word set', async () => {
    await renderQuiz([1, 2, 3]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith('quick', 1);
  });

  it('does not reopen one when the same words arrive reshuffled', async () => {
    const rerender = await renderQuiz([1, 2, 3]);

    await rerender([3, 1, 2]);
    await rerender([2, 3, 1]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('still opens a new session when the word set actually changes', async () => {
    const rerender = await renderQuiz([1, 2, 3]);

    await rerender([1, 2, 4]);

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
