import { apiClient } from './client';
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
