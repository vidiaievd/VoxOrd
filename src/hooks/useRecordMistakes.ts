import { useEffect, useRef } from 'react';
import type { UnitContentsResult } from '../api/types';
import { unitContentsResource } from '../lib/courseResources';
import { isWrongVerdict } from '../lib/mistakes';
import { getMemoryCache } from '../lib/swrCache';
import type { RunnerState } from '../screens/ExerciseRunner/runnerMachine';
import { authStore } from '../store/authStore';
import { mistakeOverlayStore } from '../store/mistakeOverlayStore';

/** The exercise's title as its unit lists it, when the unit is in memory. */
function titleIn(unitId: string, exerciseId: string): string | null {
  const unit = getMemoryCache<UnitContentsResult>(unitContentsResource(unitId).key);
  if (!unit) return null;
  const items = [...unit.sections.flatMap(section => section.items), ...unit.ungroupedItems];
  return items.find(item => item.contentId === exerciseId)?.title ?? null;
}

/**
 * Hands every verdict the runner gets to «Exercises with mistakes» (plan 05, step 8) — the
 * server's or the phone's own engine's alike, so the Practice root is right offline and
 * before it asks the server again. Work that went to a reviewer is not a mistake here.
 */
export function useRecordMistakes(state: RunnerState, courseId: string, unitId: string): void {
  const seen = useRef(state.results.length);
  const count = state.results.length;

  useEffect(() => {
    if (count <= seen.current) {
      seen.current = count;
      return;
    }
    seen.current = count;
    const last = state.results[count - 1];
    const userId = authStore.getState().user?.id;
    if (!last || !userId || last.verdict.requiresReview) return;
    const display = state.display?.id === last.exerciseId ? state.display : null;
    if (!display) return;
    void mistakeOverlayStore.record({
      userId,
      exerciseId: last.exerciseId,
      wrong: isWrongVerdict(last.verdict),
      at: new Date().toISOString(),
      templateCode: display.templateCode,
      courseId,
      unitId,
      title: titleIn(unitId, last.exerciseId),
    });
    // Only a new result matters; the rest is read as it stands at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
}
