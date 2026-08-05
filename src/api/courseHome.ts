import { apiClient } from './client';
import { getCourseMastery } from './mastery';
import { getSrsStats } from './srs';
import type {
  Container,
  ContainerItem,
  CourseHomePayload,
  CourseInfo,
  CourseMastery,
  CourseProgress,
  ModuleProgress,
  UnitStatus,
  UnitSummary,
} from './types';

const CONTAINER_PATH = (id: string) => `/api/v1/containers/${id}`;
const CONTAINER_ITEMS_PATH = (containerId: string, versionId: string) =>
  `/api/v1/containers/${containerId}/versions/${versionId}/items`;
const PROGRESS_OVERLAY_PATH = (containerId: string) =>
  `/api/v1/progress/course/${containerId}`;

/**
 * `GET /progress/course/:containerId` response (learning-service).
 * Source: ssz-platform/services/learning-service/src/modules/progress/
 * application/queries/get-course-progress-overlay.handler.ts
 */
type ItemProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

interface ItemProgressEntry {
  contentType: string;
  contentId: string;
  status: ItemProgressStatus;
  completedAt: string | null;
  score: number | null;
  moduleId: string | null;
  isRequired: boolean;
}

interface CourseProgressOverlay {
  containerId: string;
  totalItems: number;
  completedItems: number;
  completionRatio: number;
  items: ItemProgressEntry[];
}

interface UnitRollup {
  total: number;
  completed: number;
  isComplete: boolean;
}

/**
 * Buckets progress items by unit (`moduleId`). Items with `moduleId === null`
 * sit directly under the course, not under a unit, and are skipped.
 * A unit is complete once all its *required* items are completed (falls back
 * to all items if none are marked required).
 * Mirrors `rollUpByUnit` in
 * ssz-platform-web/src/app/api/learning/course-home/[courseId]/route.ts.
 */
function rollUpByUnit(items: ItemProgressEntry[]): Map<string, UnitRollup> {
  const byUnit = new Map<string, ItemProgressEntry[]>();
  for (const item of items) {
    if (item.moduleId === null) continue;
    const list = byUnit.get(item.moduleId) ?? [];
    list.push(item);
    byUnit.set(item.moduleId, list);
  }

  const rollups = new Map<string, UnitRollup>();
  for (const [unitId, unitItems] of byUnit) {
    const required = unitItems.filter((i) => i.isRequired);
    const gate = required.length > 0 ? required : unitItems;
    rollups.set(unitId, {
      total: unitItems.length,
      completed: unitItems.filter((i) => i.status === 'COMPLETED').length,
      isComplete: gate.every((i) => i.status === 'COMPLETED'),
    });
  }
  return rollups;
}

/**
 * Units in position order, one `unlocked` flag: a complete unit is always
 * `'done'`; in open gating an incomplete unit is always `'active'`; in
 * sequential gating only the first incomplete unit is `'active'`, the rest
 * `'locked'`. A unit with no rollup (unseeded/empty) counts as complete so it
 * can't stall the chain.
 * Mirrors `deriveUnitStatuses` in the same web BFF route file.
 */
function deriveUnitStatuses(
  unitIds: string[],
  rollups: Map<string, UnitRollup>,
  gatingMode: 'open' | 'sequential',
): UnitStatus[] {
  let unlocked = true;
  return unitIds.map((id) => {
    const isComplete = rollups.get(id)?.isComplete ?? true;
    if (isComplete) return 'done';
    if (gatingMode === 'open') return 'active';
    if (unlocked) {
      unlocked = false;
      return 'active';
    }
    return 'locked';
  });
}

function toModuleProgressStatus(
  status: UnitStatus,
): 'completed' | 'not_started' | 'in_progress' {
  switch (status) {
    case 'done':
      return 'completed';
    case 'active':
      return 'in_progress';
    case 'locked':
      return 'not_started';
  }
}

/**
 * Client-side recomposition of the web BFF's course-home route (no single
 * gateway endpoint covers this). Mastery and SRS-due are real (Phase 6).
 * `canDo` is deliberately left as a stub: the platform has no content-relation
 * data yet linking can-do descriptors to courses/modules, so it would always
 * render empty regardless of client work — see the plan's Phase 6 notes.
 * Mastery/SRS-due failures are non-fatal (matches the existing `items` fetch
 * pattern below) — a stat block failing to load shouldn't block the rest of
 * the course-home screen.
 */
export async function getCourseHome(courseId: string): Promise<CourseHomePayload> {
  const [overlay, container, mastery, srsStats] = await Promise.all([
    apiClient.get<CourseProgressOverlay>(PROGRESS_OVERLAY_PATH(courseId)),
    apiClient.get<Container>(CONTAINER_PATH(courseId)),
    getCourseMastery(courseId).catch((e): CourseMastery => {
      console.warn(`[CourseHome] Failed to load mastery for ${courseId}:`, e);
      return { courseId, overallMastery: 0, bySkill: [] };
    }),
    getSrsStats().catch((e) => {
      console.warn('[CourseHome] Failed to load SRS stats:', e);
      return null;
    }),
  ]);

  let items: ContainerItem[] = [];
  if (container.currentPublishedVersionId) {
    try {
      items = await apiClient.get<ContainerItem[]>(
        CONTAINER_ITEMS_PATH(courseId, container.currentPublishedVersionId),
      );
    } catch (e) {
      console.warn(`[CourseHome] Failed to load items for ${courseId}:`, e);
    }
  }

  const unitItems = items
    .filter((item) => item.itemType === 'container')
    .sort((a, b) => a.position - b.position);

  const rollups = rollUpByUnit(overlay.items);
  const statuses = deriveUnitStatuses(
    unitItems.map((item) => item.itemId),
    rollups,
    container.gatingMode ?? 'open',
  );

  const units: UnitSummary[] = unitItems.map((item, i) => {
    const rollup = rollups.get(item.itemId);
    return {
      id: item.itemId,
      position: item.position,
      title: item.title ?? `Unit ${item.position}`,
      status: statuses[i],
      completedLessons: rollup?.completed ?? 0,
      totalLessons: rollup?.total ?? 0,
    };
  });

  const modules: ModuleProgress[] = units.map((unit) => ({
    moduleId: unit.id,
    status: toModuleProgressStatus(unit.status),
    completedLessons: unit.completedLessons,
    totalLessons: unit.totalLessons,
  }));

  const courseInfo: CourseInfo = {
    id: container.id,
    title: container.title,
    cefrLevel: container.difficultyLevel,
    targetLanguage: container.targetLanguage,
  };

  const progress: CourseProgress = {
    courseId: container.id,
    totalLessons: overlay.totalItems,
    completedLessons: overlay.completedItems,
    percentComplete: overlay.completionRatio * 100,
    modules,
    lessons: [],
  };

  return {
    courseInfo,
    units,
    levels: [],
    progress,
    mastery,
    // /srs/stats/me has no courseId filter — this is the user's total due
    // count across all content, not scoped to this course. The web BFF has
    // the same limitation (its /srs/due call is unfiltered too). Label this
    // in the UI as a general "reviews due" stat, not a per-course one.
    srsDueCount: srsStats?.dueNowCount ?? 0,
    srsReviewedToday: srsStats?.reviewedTodayCount ?? 0,
    canDo: { items: [] },
  };
}
