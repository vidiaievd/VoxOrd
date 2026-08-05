/**
 * Combines locally-due personal words with due course cards into the single
 * "what to study now" count shown on Home. Local due comes from
 * `deck.repeatWords` (already computed per deck in SQL); course due comes
 * from the server's global `/srs/stats/me` `dueNowCount`.
 */
export interface StudyNowStatus {
  localDue: number;
  courseDue: number;
  totalDue: number;
}

export function aggregateStudyNow(
  deckRepeatCounts: number[],
  courseDueCount: number,
): StudyNowStatus {
  const localDue = deckRepeatCounts.reduce((sum, n) => sum + n, 0);
  const courseDue = Math.max(0, courseDueCount);
  return { localDue, courseDue, totalDue: localDue + courseDue };
}
