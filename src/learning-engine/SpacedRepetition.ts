import { MemoryStage } from '../db/types';

// Intervals in milliseconds
const REVIEW_INTERVALS: Record<MemoryStage, number> = {
  0: 0,
  1: 1 * 60 * 60 * 1000, // 1 hour
  2: 8 * 60 * 60 * 1000, // 8 hours
  3: 1 * 24 * 60 * 60 * 1000, // 1 day
  4: 3 * 24 * 60 * 60 * 1000, // 3 days
  5: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export interface AnswerResult {
  newStage: MemoryStage;
  nextReview: number;
  shortTermStrength: number;
  longTermStrength: number;
  newStatus: 'new' | 'repeat' | 'learned';
  xpEarned: number;
}

export class SpacedRepetition {
  static processAnswer(params: {
    isCorrect: boolean;
    currentStage: MemoryStage;
    reviewCount: number;
    successCount: number;
    shortTermStrength: number;
    longTermStrength: number;
  }): AnswerResult {
    const {
      isCorrect,
      currentStage,
      reviewCount,
      successCount,
      shortTermStrength,
      longTermStrength,
    } = params;

    const successRate = reviewCount > 0 ? successCount / reviewCount : 0;

    let newStage = currentStage;
    let newShortTerm = shortTermStrength;
    let newLongTerm = longTermStrength;

    if (isCorrect) {
      if (currentStage < 5 && (successRate >= 0.6 || reviewCount === 0)) {
        newStage = (currentStage + 1) as MemoryStage;
      }
      newShortTerm = Math.min(1.0, shortTermStrength + 0.2);
      newLongTerm = Math.min(1.0, longTermStrength + 0.05);
    } else {
      if (currentStage > 0) {
        newStage = (currentStage - 1) as MemoryStage;
      }
      newShortTerm = Math.max(0.0, shortTermStrength - 0.3);
      newLongTerm = Math.max(0.0, longTermStrength - 0.1);
    }

    const interval = REVIEW_INTERVALS[newStage];
    const nextReview = Date.now() + interval;

    const newStatus: AnswerResult['newStatus'] =
      newStage >= 4 ? 'learned' : newStage >= 1 ? 'repeat' : 'new';

    const xpEarned = isCorrect ? (newStage + 1) * 5 : 0;

    return {
      newStage,
      nextReview,
      shortTermStrength: newShortTerm,
      longTermStrength: newLongTerm,
      newStatus,
      xpEarned,
    };
  }

  static isDue(nextReview: number | null, stage: MemoryStage): boolean {
    if (stage === 0 || !nextReview) return true;
    return Date.now() >= nextReview;
  }

  static getStageLabel(stage: MemoryStage): string {
    const labels: Record<MemoryStage, string> = {
      0: 'New',
      1: 'Seen',
      2: 'Recognized',
      3: 'Familiar',
      4: 'Learned',
      5: 'Mastered',
    };
    return labels[stage];
  }
}
