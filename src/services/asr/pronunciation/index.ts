import { PronunciationScorer } from './PronunciationScorer';
import { TextBasedScorer } from './TextBasedScorer';

export function createPronunciationScorer(): PronunciationScorer {
  return new TextBasedScorer();
}

export type {
  PronunciationScorer,
  PronunciationScore,
  FeedbackItem,
} from './PronunciationScorer';
export { TextBasedScorer } from './TextBasedScorer';
