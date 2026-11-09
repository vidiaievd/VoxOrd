import { apiClient } from './client';
import type { Container, ContainerItem, Enrollment } from './types';

/**
 * The public course catalogue (Courses spec §5.3, §14.1).
 *
 * Mirrors the web's `DiscoverCatalog`: content-service `GET /containers` with
 * `visibility=public` (what the web BFF turns its `scope=public` into), every page read up
 * front and filtered on the client. Only published courses are kept — a public course
 * with no published version has nothing to open.
 */

const CONTAINERS_PATH = '/api/v1/containers';
const ENROLLMENTS_PATH = '/api/v1/enrollments';
const PAGE_LIMIT = 100;
/** A guard against a server that never says it is done; 10 × 100 courses is plenty. */
const MAX_PAGES = 10;

interface ContainerPage {
  items: Container[];
  page: number;
  totalPages: number;
}

export async function getCatalog(): Promise<Container[]> {
  const all: Container[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await apiClient.get<ContainerPage>(CONTAINERS_PATH, {
      query: { visibility: 'public', containerType: 'course', limit: PAGE_LIMIT, page },
    });
    all.push(...res.items);
    if (res.page >= res.totalPages) break;
  }
  return all.filter((c) => !!c.currentPublishedVersionId);
}

export interface CatalogCourseDetail {
  container: Container;
  /** The units of the published version, in order (sub-containers only). */
  units: ContainerItem[];
}

/** A course before enrolment: its card and the programme (spec 5c). */
export async function getCatalogCourse(containerId: string): Promise<CatalogCourseDetail> {
  const container = await apiClient.get<Container>(`${CONTAINERS_PATH}/${containerId}`);
  const versionId = container.currentPublishedVersionId;
  if (!versionId) return { container, units: [] };
  const items = await apiClient.get<ContainerItem[]>(
    `${CONTAINERS_PATH}/${containerId}/versions/${versionId}/items`,
  );
  const units = items
    .filter((i) => i.itemType === 'container')
    .sort((a, b) => a.position - b.position);
  return { container, units };
}

/**
 * Self-study enrolment. learning-service lets a learner in on their own only to a
 * `public_free` course (a 403 otherwise) and answers 409 when they already hold it.
 */
export async function enrollInCourse(containerId: string): Promise<Enrollment> {
  return apiClient.post<Enrollment>(ENROLLMENTS_PATH, { containerId });
}
