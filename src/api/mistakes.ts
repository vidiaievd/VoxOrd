import { apiClient } from './client';
import type { ServerMistake } from '../lib/mistakes';

/*
 * exercise-engine `GET /api/v1/attempts/mistakes` (VoxOrd plan 05, step 8): the learner's
 * exercises whose latest machine-scored attempt in a course failed, newest first, and how
 * many there are. Confirmed against services/exercise-engine-service/src/modules/attempts/
 * presentation/controllers/my-submissions.controller.ts; the gateway's `/api/v1/attempts`
 * block already covers it.
 */

const PATH = '/api/v1/attempts/mistakes';

/** Enough beyond the three rows that a correction on the phone does not empty the section. */
export const MISTAKES_PAGE = 20;

interface RawMistake {
  exerciseId: string;
  templateCode: string;
  containerId: string;
  unitId: string | null;
  exerciseTitle: string | null;
  attemptedAt: string;
}

export async function getCourseMistakes(
  courseId: string,
): Promise<{ items: ServerMistake[]; total: number }> {
  const raw = await apiClient.get<{ items: RawMistake[]; total: number }>(PATH, {
    query: { courseId, limit: MISTAKES_PAGE },
  });
  return {
    total: raw.total,
    items: raw.items.map(item => ({
      exerciseId: item.exerciseId,
      templateCode: item.templateCode,
      courseId: item.containerId,
      unitId: item.unitId,
      title: item.exerciseTitle,
      attemptedAt: item.attemptedAt,
    })),
  };
}
