import { PronunciationScorer } from './PronunciationScorer';
import { TextBasedScorer } from './TextBasedScorer';

export type ScorerTier = 'free' | 'premium';

// Factory — in the future premium tier returned PhonemeScorer (Azure/ML)
export function createPronunciationScorer(
  tier: ScorerTier = 'free',
): PronunciationScorer {
  switch (tier) {
    case 'premium':
      // TODO: return new PhonemeScorer();
      return new TextBasedScorer();
    case 'free':
    default:
      return new TextBasedScorer();
  }
}

export type {
  PronunciationScorer,
  PronunciationScore,
  FeedbackItem,
} from './PronunciationScorer';
export { TextBasedScorer } from './TextBasedScorer';
