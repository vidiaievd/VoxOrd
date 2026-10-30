import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  useCourseReviewSession,
  type UseCourseReviewSessionResult,
} from './useCourseReviewSession';
import type { DeckReviewSet } from '../lib/courseReviewLoader';

/**
 * The session's summary views (`byPhase`, `hasAnswers`) read the same evidence the ratings
 * come from and must not change what is posted: one rating per graded word, padding ignored.
 */

const mockSubmit = jest.fn();

jest.mock('../repositories/DeepSessionRepository', () => ({
  deepSessionRepository: { loadWordsByIds: jest.fn(async () => []) },
}));

jest.mock('../store/reviewQueueStore', () => ({
  reviewQueueStore: {
    submit: (...args: unknown[]) => mockSubmit(...args),
  },
}));

jest.mock('../services/vocabularyReplica', () => ({
  vocabularyReplica: {
    recordReview: jest.fn(async () => undefined),
    recordServerCard: jest.fn(async () => undefined),
  },
}));

const due = (wordId: number) => ({
  cardId: `card-${wordId}`,
  wordId,
  deckId: 1,
  state: 'REVIEW' as const,
  word: `word${wordId}`,
});

// Four words so listening and quiz are planned; word 9 is padding.
const set: DeckReviewSet = {
  deckId: 1,
  deckTitle: 'Leksjon 17',
  due: [due(1), due(2), due(3)],
  padWordIds: [9],
  wordIds: [1, 2, 3, 9],
};

async function renderSession() {
  const result: { current: UseCourseReviewSessionResult | null } = { current: null };
  function Probe() {
    result.current = useCourseReviewSession(set);
    return null;
  }
  await act(async () => {
    ReactTestRenderer.create(<Probe />);
  });
  return result as { current: UseCourseReviewSessionResult };
}

beforeEach(() => {
  mockSubmit.mockReset();
  mockSubmit.mockResolvedValue(null);
});

describe('useCourseReviewSession', () => {
  it('plans the phases and starts without answers', async () => {
    const session = await renderSession();

    expect(session.current.state.phases).toEqual(['listening', 'quiz', 'spelling']);
    expect(session.current.state.hasAnswers).toBe(false);
  });

  it('reports first-try correctness per phase and still posts one rating per word', async () => {
    const session = await renderSession();
    const answer = (wordId: number, correct: boolean) =>
      act(() => session.current.tracking.onAnswer?.(wordId, { correct }));

    // listening: 1 right, 2 wrong then right, padding ignored
    await answer(1, true);
    await answer(2, false);
    await answer(2, true);
    await answer(9, false);
    expect(session.current.state.hasAnswers).toBe(true);
    await act(async () => session.current.advance());

    // quiz: both right
    await answer(1, true);
    await answer(2, true);
    await act(async () => session.current.advance());

    // spelling: 1 right
    await answer(1, true);
    await act(async () => session.current.advance());

    const { state } = session.current;
    expect(state.stage).toBe('complete');
    expect(state.byPhase).toEqual([
      { mode: 'listening', total: 2, correct: 1 },
      { mode: 'quiz', total: 2, correct: 2 },
      { mode: 'spelling', total: 1, correct: 1 },
    ]);
    // Word 3 never answered: left due, nothing posted for it or for the padding word.
    expect(mockSubmit.mock.calls.map(c => c[0]).sort()).toEqual(['card-1', 'card-2']);
    expect(state.ungradedCount).toBe(1);
    expect(state.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('finishing early grades what exists', async () => {
    const session = await renderSession();
    await act(() => session.current.tracking.onAnswer?.(3, { correct: false }));
    await act(async () => session.current.finishEarly());

    expect(session.current.state.stage).toBe('complete');
    expect(mockSubmit.mock.calls.map(c => c[0])).toEqual(['card-3']);
    expect(session.current.state.byPhase).toEqual([
      { mode: 'listening', total: 1, correct: 0 },
    ]);
  });
});
