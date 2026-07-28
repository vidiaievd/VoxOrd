import { ExerciseType, SessionType } from '../db/types';

export interface SessionConfig {
  type: SessionType;
  deckId?: number;
  wordLimit: number;
}

// Configuration of modes by session type
const SESSION_DEFINITIONS: Record<
  SessionType,
  {
    wordLimit: number;
    exercises: ExerciseType[];
    // how many times each word appears in the session (for spaced repetition)
    repetitions: number;
  }
> = {
  quick: {
    wordLimit: 10,
    exercises: ['flashcard', 'quiz'],
    repetitions: 1,
  },
  standard: {
    wordLimit: 15,
    exercises: ['flashcard', 'matching', 'spelling', 'quiz'],
    repetitions: 1,
  },
  deep: {
    wordLimit: 20,
    exercises: [
      'flashcard',
      'listening',
      'matching',
      'spelling',
      'context',
      'quiz',
    ],
    repetitions: 2,
  },
  review: {
    wordLimit: 20,
    exercises: ['flashcard', 'quiz', 'spelling'],
    repetitions: 1,
  },
  test: {
    wordLimit: 20,
    exercises: ['quiz', 'spelling', 'context'],
    repetitions: 1,
  },
};

export class SessionEngine {
  // Calculate XP based on performance and session type
  static calculateXP(params: {
    correctAnswers: number;
    totalAnswers: number;
    sessionType: SessionType;
  }): number {
    const { correctAnswers, totalAnswers, sessionType } = params;

    if (totalAnswers === 0) return 0;

    const accuracy = correctAnswers / totalAnswers;
    const base = correctAnswers * 10;
    const bonus =
      accuracy >= 0.9 ? 100 : accuracy >= 0.8 ? 50 : accuracy >= 0.6 ? 25 : 0;

    const multipliers: Record<SessionType, number> = {
      quick: 1.0,
      standard: 1.5,
      deep: 2.0,
      review: 1.2,
      test: 1.8,
    };

    return Math.round((base + bonus) * multipliers[sessionType]);
  }

  // Get session configuration by type
  static getConfig(
    sessionType: SessionType,
  ): (typeof SESSION_DEFINITIONS)[SessionType] {
    return SESSION_DEFINITIONS[sessionType];
  }
}
