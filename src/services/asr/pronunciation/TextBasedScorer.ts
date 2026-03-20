import {
  PronunciationScorer,
  PronunciationScore,
  FeedbackItem,
} from './PronunciationScorer';

// Levenshtein distance on characters
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp[m][n];
}

// Normalize: lowercase, trim, collapse spaces
function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Word-level diff to generate feedback
function wordDiff(transcript: string[], reference: string[]): FeedbackItem[] {
  const feedback: FeedbackItem[] = [];
  const maxLen = Math.max(transcript.length, reference.length);

  for (let i = 0; i < maxLen; i++) {
    const got = transcript[i];
    const expected = reference[i];

    if (!expected && got) {
      feedback.push({ type: 'extra', expected: '', got, position: i });
    } else if (expected && !got) {
      feedback.push({ type: 'missing', expected, got: '', position: i });
    } else if (expected !== got) {
      feedback.push({ type: 'wrong', expected, got, position: i });
    }
  }

  return feedback;
}

export class TextBasedScorer implements PronunciationScorer {
  score(transcript: string, reference: string): PronunciationScore {
    const normTranscript = normalize(transcript);
    const normReference = normalize(reference);

    // Exact match — 100
    if (normTranscript === normReference) {
      return { overall: 100, accuracy: 100, fluency: 100, feedback: [] };
    }

    const distance = levenshtein(normTranscript, normReference);
    const maxLen = Math.max(normTranscript.length, normReference.length);
    const accuracy = Math.round((1 - distance / maxLen) * 100);

    // Below threshold — hard zero, no partial credit
    if (accuracy < 70) {
      return {
        overall: 0,
        accuracy: 0,
        fluency: 100,
        feedback: wordDiff(normTranscript.split(' '), normReference.split(' ')),
      };
    }

    const overall = Math.round(accuracy * 0.8 + 100 * 0.2);
    return {
      overall,
      accuracy,
      fluency: 100,
      feedback: wordDiff(normTranscript.split(' '), normReference.split(' ')),
    };
  }
}
