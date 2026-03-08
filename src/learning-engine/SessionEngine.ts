import { ExerciseType, SessionType, MemoryStage } from '../db/types';
import { Word } from '../db/words';

export interface SessionWord extends Word {
  memoryStage: MemoryStage;
  nextReview: number | null;
  reviewCount: number;
}

export interface Exercise {
  id: string; // unique identifier for the exercise
  type: ExerciseType;
  word: SessionWord;
  options?: string[]; // for quiz/matching
  correctIndex?: number; // for quiz
}

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

// Order of exercises — from simple to complex
const EXERCISE_ORDER: Record<ExerciseType, number> = {
  flashcard: 1,
  listening: 2,
  matching: 3,
  context: 4,
  spelling: 5,
  quiz: 6,
};

export class SessionEngine {
  // Prioritize words for the session based on due status, memory stage, and review count
  static prioritizeWords(words: SessionWord[]): SessionWord[] {
    return [...words].sort((a, b) => {
      // 1. Those due for review come first (nextReview in the past or null)
      const now = Date.now();
      const aDue = !a.nextReview || now >= a.nextReview ? 0 : 1;
      const bDue = !b.nextReview || now >= b.nextReview ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;

      // 2. By memory stage (newer words first)
      if (a.memoryStage !== b.memoryStage) {
        return a.memoryStage - b.memoryStage;
      }

      // 3. By review count (less reviewed first)
      return a.reviewCount - b.reviewCount;
    });
  }

  // Build list of exercises for the session based on session type and selected words
  static buildExercises(
    words: SessionWord[],
    sessionType: SessionType,
  ): Exercise[] {
    const def = SESSION_DEFINITIONS[sessionType];
    const exercises: Exercise[] = [];
    let counter = 0;

    for (let rep = 0; rep < def.repetitions; rep++) {
      for (const exerciseType of def.exercises) {
        for (const word of words) {
          exercises.push({
            id: `${exerciseType}_${word.id}_${rep}_${counter++}`,
            type: exerciseType,
            word,
          });
        }
      }
    }

    // Sort exercises by predefined order
    return exercises.sort(
      (a, b) => EXERCISE_ORDER[a.type] - EXERCISE_ORDER[b.type],
    );
  }

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
