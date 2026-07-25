import { apiClient } from './client';

const SRS_STATS_PATH = '/api/v1/srs/stats/me';

/**
 * `GET /srs/stats/me` (learning-service). Confirmed against
 * services/learning-service/src/modules/srs/presentation/srs.controller.ts
 * and srs.dto.ts (`SrsStatsDto`) — proxied by the gateway's existing
 * `location /api/v1/srs` block.
 *
 * `dueNowCount` is the real total due count. `GET /srs/due` (Phase 8's
 * review session) only returns a bounded sample — do not use its `cards`
 * array length as a due count, that was a bug found and fixed in the web
 * BFF (see the plan's Phase 6 gateway note).
 */
export interface SrsStats {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
  suspendedCount: number;
  dueNowCount: number;
  reviewedTodayCount: number;
}

export async function getSrsStats(): Promise<SrsStats> {
  return apiClient.get<SrsStats>(SRS_STATS_PATH);
}
