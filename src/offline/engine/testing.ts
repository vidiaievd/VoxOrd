import type { ExerciseDisplay } from '../../api/types';
import type { LocalAttempt } from './attempt';
import { lcg } from '../../kernel/minimal-pairs';
import { LocalEngine, type JournalOp, type ProbeHistorySnapshot } from './engine';
import type { ExerciseKey } from './grading';

/**
 * A local engine over memory, for tests: the exercises it knows, a fixed learner, a clock that
 * moves a millisecond per call and as far as `advance` says, and the journal it wrote.
 */
export function memoryEngine(
  exercises: Record<string, { display: ExerciseDisplay; key: ExerciseKey }>,
  userId = 'user-1',
  extra: {
    /** Kept clips; by default every clip is kept, at `file:///media/<assetId>`. */
    clipUrl?: (assetId: string) => string | null;
    probeHistory?: Record<string, ProbeHistorySnapshot>;
    seed?: number;
  } = {},
) {
  const random = lcg(extra.seed ?? 7);
  const attempts = new Map<string, LocalAttempt>();
  const journal: Array<{ attemptId: string; op: JournalOp }> = [];
  let ids = 0;
  let clock = Date.parse('2026-10-15T10:00:00.000Z');
  const engine = new LocalEngine({
    now: () => new Date((clock += 1)),
    newId: () => String(++ids),
    userId: () => userId,
    display: async id => exercises[id]?.display ?? null,
    key: async id => exercises[id]?.key ?? null,
    clipUrl: async assetId =>
      extra.clipUrl ? extra.clipUrl(assetId) : assetId ? `file:///media/${assetId}` : null,
    probeHistory: async id => extra.probeHistory?.[id] ?? null,
    random,
    attempts: {
      get: async id => {
        const a = attempts.get(id);
        return a ? (JSON.parse(JSON.stringify(a)) as LocalAttempt) : null;
      },
      put: async a => {
        attempts.set(a.id, JSON.parse(JSON.stringify(a)) as LocalAttempt);
      },
      listFor: async (user, exerciseId) =>
        [...attempts.values()]
          .filter(a => a.userId === user && a.exerciseId === exerciseId)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      listAll: async user =>
        [...attempts.values()]
          .filter(a => a.userId === user)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    },
    journal: async (attempt, op) => {
      journal.push({ attemptId: attempt.id, op });
    },
  });
  return {
    engine,
    attempts,
    journal,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

/** An exercise as the download keeps it, from the key `/answers` returned. */
export function exerciseFrom(
  id: string,
  key: ExerciseKey,
  projection: Record<string, unknown> = {},
): { display: ExerciseDisplay; key: ExerciseKey } {
  return {
    display: {
      id,
      templateCode: key.templateCode as ExerciseDisplay['templateCode'],
      targetLanguage: 'nb',
      content: projection,
    },
    key,
  };
}
