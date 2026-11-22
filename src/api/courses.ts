import { ApiError, apiClient } from './client';
import type { Container, Enrollment } from './types';

const ENROLLMENTS_PATH = '/api/v1/enrollments';
const CONTAINER_PATH = (id: string) => `/api/v1/containers/${id}`;

export interface CourseListItem {
  enrollment: Enrollment;
  container: Container;
}

export async function getMyEnrollments(): Promise<Enrollment[]> {
  return apiClient.get<Enrollment[]>(ENROLLMENTS_PATH);
}

/** Leaves a self-study course; the server rejects a school-assigned enrollment. */
export async function leaveEnrollment(enrollmentId: string): Promise<void> {
  await apiClient.delete<unknown>(`${ENROLLMENTS_PATH}/${enrollmentId}`);
}

export async function getContainer(containerId: string): Promise<Container> {
  return apiClient.get<Container>(CONTAINER_PATH(containerId));
}

/**
 * Active enrollments joined with their course container metadata, mirroring
 * the web student dashboard's `getMyCourses` (which also folds in a
 * progress-service feed and school-assigned containers — out of scope here;
 * see Step 2.2 for progress). A container that failed to load (e.g. access
 * revoked after enrollment) is dropped rather than failing the whole list.
 */
export async function getMyCourses(): Promise<CourseListItem[]> {
  const enrollments = await getMyEnrollments();
  const active = enrollments.filter((e) => e.status === 'ACTIVE');

  const results = await Promise.allSettled(
    active.map((enrollment) => getContainer(enrollment.containerId)),
  );

  const items: CourseListItem[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push({ enrollment: active[i], container: result.value });
    } else {
      console.warn(
        `[Courses] Failed to load container ${active[i].containerId}:`,
        result.reason,
      );
    }
  });
  return items;
}

/** A finished course the learner can look back on: its container, or `null` once it is gone for them. */
export interface HistoryItem {
  enrollment: Enrollment;
  container: Container | null;
}

/**
 * Finished enrolments for the «History» section (plan 90, live check, Q15). A purged school's
 * enrolments end `COMPLETED` and its course stays readable as history (Q11) — unless it is a
 * `shared` course of someone else, which answers 403 / 404: such a row is kept with
 * `container: null` so the learner is told it is gone instead of it vanishing. Any other
 * failure (network, server) drops the row, as `getMyCourses` does.
 */
export async function getMyHistory(): Promise<HistoryItem[]> {
  const enrollments = await getMyEnrollments();
  const done = enrollments
    .filter((e) => e.status === 'COMPLETED')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  const results = await Promise.allSettled(done.map((e) => getContainer(e.containerId)));

  const items: HistoryItem[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      items.push({ enrollment: done[i], container: result.value });
    } else if (
      result.reason instanceof ApiError &&
      (result.reason.status === 403 || result.reason.status === 404)
    ) {
      items.push({ enrollment: done[i], container: null });
    }
  });
  return items;
}
