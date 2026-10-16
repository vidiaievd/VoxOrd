import { ApiError } from '../../api/client';
import { setLocalAttempts, type LocalAttempts } from '../../api/exercises';
import type { ExerciseDisplay } from '../../api/types';
import { exerciseDisplayResource, probeHistoryResource } from '../../lib/courseResources';
import { mediaCache } from '../../services/mediaCache';
import { randomNonce } from '../../lib/reviewQueue';
import { getMemoryCache, readCacheSnapshot } from '../../lib/swrCache';
import { authStore } from '../../store/authStore';
import { exerciseOutboxStore } from '../../store/exerciseOutboxStore';
import { settingsStore } from '../../store/settingsStore';
import { isLocalAttemptId, LocalRefusal } from './attempt';
import { LocalEngine, type ProbeHistorySnapshot } from './engine';
import { exerciseKeyCacheKey, type ExerciseKey } from './grading';
import { LocalAttemptStore } from './store';

async function cached<T>(key: string): Promise<T | null> {
  return getMemoryCache<T>(key) ?? (await readCacheSnapshot<T>(key));
}

export const localEngine = new LocalEngine({
  now: () => new Date(),
  newId: () => `${Date.now().toString(36)}${randomNonce()}`,
  userId: () => authStore.getState().user?.id ?? null,
  display: exerciseId =>
    cached<ExerciseDisplay>(
      exerciseDisplayResource(exerciseId, settingsStore.getAll().uiLanguage).key,
    ),
  key: exerciseId => cached<ExerciseKey>(exerciseKeyCacheKey(exerciseId)),
  clipUrl: async assetId => (assetId ? ((await mediaCache.lookup(assetId))?.url ?? null) : null),
  probeHistory: exerciseId =>
    cached<ProbeHistorySnapshot>(probeHistoryResource(exerciseId).key),
  random: Math.random,
  attempts: new LocalAttemptStore(),
  journal: (attempt, op) => exerciseOutboxStore.recordLocalOp(attempt, op),
});

/** A refusal of the engine on the phone, in the shape the server's would arrive. */
function asApiError(e: unknown): unknown {
  if (!(e instanceof LocalRefusal)) return e;
  return new ApiError({ message: e.message, status: e.status, code: e.code, body: e.body });
}

async function answered<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    throw asApiError(e);
  }
}

const localAttempts: LocalAttempts = {
  isLocal: isLocalAttemptId,
  hasOpenAttempt: async exerciseId => (await localEngine.openAttemptAt(exerciseId)) !== null,
  canStart: exerciseId => localEngine.canStart(exerciseId),
  start: (exerciseId, body) => answered(() => localEngine.start(exerciseId, body)),
  submit: (attemptId, body) => answered(() => localEngine.submit(attemptId, body)),
  answerQuestion: (attemptId, body) => answered(() => localEngine.answerQuestion(attemptId, body)),
  handOutProbe: attemptId => answered(() => localEngine.handOutProbe(attemptId)),
  checkRow: (attemptId, body) => answered(() => localEngine.checkRow(attemptId, body)),
  revealAnswers: attemptId => answered(() => localEngine.revealAnswers(attemptId)),
  selfCheck: (attemptId, draft) => answered(() => localEngine.selfCheck(attemptId, draft)),
  saveDraft: (attemptId, draft) => answered(() => localEngine.saveDraft(attemptId, draft)),
  getAttempt: attemptId => answered(() => localEngine.getAttempt(attemptId)),
  findOpenAttempt: exerciseId => localEngine.findOpenAttempt(exerciseId),
  findOpenBoardCheck: exerciseId => localEngine.findOpenBoardCheck(exerciseId),
  recentAttempts: (exerciseId, limit) => localEngine.recentAttempts(exerciseId, limit),
};

/** Puts the phone's engine behind `api/exercises` — called once, at app start. */
export function installLocalAttempts(): void {
  setLocalAttempts(localAttempts);
}
