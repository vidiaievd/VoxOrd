import { apiClient } from './client';
import type { UnitContentsResult } from './types';

const UNIT_CONTENTS_PATH = (unitId: string) => `/api/v1/progress/units/${unitId}/contents`;

/**
 * `GET /progress/units/:moduleId/contents` (learning-service). Confirmed
 * against services/learning-service/src/modules/progress/presentation/
 * progress.controller.ts (`@Controller('progress') @Get('units/:moduleId/
 * contents')`) — single gateway endpoint, no client-side composition needed.
 */
export async function getUnitContents(unitId: string): Promise<UnitContentsResult> {
  return apiClient.get<UnitContentsResult>(UNIT_CONTENTS_PATH(unitId));
}
