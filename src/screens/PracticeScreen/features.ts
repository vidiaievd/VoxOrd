/**
 * Parts of the Practice tab behind a switch (plan 05, «Backend gaps»). Each waits for a
 * server route that does not exist yet; with the switch off the section is simply absent.
 */
export const PRACTICE_FEATURES = {
  /** `/srs/forecast` — the «Next: tomorrow 9 · …» line. */
  forecast: false,
  /** Rules due for review — learning-service `GET /mastery/grammar-rules/due` (step 7). */
  grammarDue: true,
  /** Exercises with a wrong attempt — needs a learner route in exercise-engine. */
  mistakes: false,
};
