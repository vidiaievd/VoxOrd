import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { usePersonalSession, type PersonalSession } from './usePersonalSession';

/**
 * A session grades its words once and never runs again, so a word whose write
 * throws has no second chance — and `finish` is called with neither `await` nor
 * `.catch` from both of its call sites. One failure therefore used to end the
 * loop, dropping every word after it with nothing logged.
 *
 * A device test showed one word answered correctly in `session_results` with
 * `fsrsReps` still at 0; the cause was never reproduced (a dev-build hiccup is
 * as likely as a real throw), so these tests pin the resilience rather than the
 * cause.
 */

const mockApplyReview = jest.fn();
const mockAddXP = jest.fn();

jest.mock('../repositories/ProgressRepository', () => ({
  progressRepository: {
    applyReview: (...args: unknown[]) => mockApplyReview(...args),
  },
}));

jest.mock('../repositories/UserRepository', () => ({
  userRepository: {
    addXP: (...args: unknown[]) => mockAddXP(...args),
  },
}));

const card = {
  profileId:  'test',
  stability:  1,
  difficulty: 5,
  reps:       1,
  lapses:     0,
  state:      'review',
  due:        Date.now(),
  lastReview: Date.now(),
};

/** Mounts the hook and hands back the session it produced. */
function mountSession(deckId = 1): PersonalSession {
  let session!: PersonalSession;

  function Probe() {
    session = usePersonalSession(deckId, { awardXp: true });
    return null;
  }

  act(() => {
    ReactTestRenderer.create(<Probe />);
  });

  return session;
}

beforeEach(() => {
  mockApplyReview.mockReset().mockResolvedValue(card);
  mockAddXP.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePersonalSession finish', () => {
  it('schedules every answered word', async () => {
    const session = mountSession();
    const tracking = session.trackingFor('spelling');
    tracking.onAnswer?.(1, { correct: true });
    tracking.onAnswer?.(2, { correct: true });

    await act(async () => {
      await session.finish();
    });

    expect(mockApplyReview.mock.calls.map(c => c[0])).toEqual([1, 2]);
  });

  it('keeps scheduling the remaining words after one write throws', async () => {
    mockApplyReview.mockImplementation(async (wordId: number) => {
      if (wordId === 2) throw new Error('database is locked');
      return card;
    });

    const session = mountSession();
    const tracking = session.trackingFor('spelling');
    tracking.onAnswer?.(1, { correct: true });
    tracking.onAnswer?.(2, { correct: true });
    tracking.onAnswer?.(3, { correct: true });

    await act(async () => {
      await session.finish();
    });

    expect(mockApplyReview.mock.calls.map(c => c[0])).toEqual([1, 2, 3]);
  });

  it('names the word it could not schedule instead of failing silently', async () => {
    mockApplyReview.mockRejectedValue(new Error('database is locked'));

    const session = mountSession();
    session.trackingFor('spelling').onAnswer?.(7, { correct: true });

    await act(async () => {
      await session.finish();
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('7'),
      expect.any(Error),
    );
  });

  it('does not reject, since both call sites drop the promise', async () => {
    mockApplyReview.mockRejectedValue(new Error('database is locked'));
    mockAddXP.mockRejectedValue(new Error('database is locked'));

    const session = mountSession();
    session.trackingFor('spelling').onAnswer?.(1, { correct: true });

    await act(async () => {
      await expect(session.finish()).resolves.toBeUndefined();
    });
  });

  it('still awards the XP earned by the words that did succeed', async () => {
    mockApplyReview.mockImplementation(async (wordId: number) => {
      if (wordId === 1) throw new Error('database is locked');
      return card;
    });

    const session = mountSession();
    const tracking = session.trackingFor('flashcard');
    tracking.onAnswer?.(1, { correct: true });
    tracking.onAnswer?.(2, { correct: true });

    await act(async () => {
      await session.finish();
    });

    expect(mockAddXP).toHaveBeenCalledTimes(1);
    expect(mockAddXP.mock.calls[0][0]).toBeGreaterThan(0);
  });
});
