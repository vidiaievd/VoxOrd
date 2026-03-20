export interface FeedbackItem {
  type: 'missing' | 'wrong' | 'extra';
  expected: string;
  got: string;
  position: number;
}

export interface PronunciationScore {
  overall: number; // 0–100
  accuracy: number; // 0–100
  fluency: number; // 0–100, just always 100 for text-based
  feedback: FeedbackItem[];
}

export interface PronunciationScorer {
  score(transcript: string, reference: string): PronunciationScore;
}
