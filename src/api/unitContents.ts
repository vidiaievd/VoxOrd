import { apiClient } from './client';
import type {
  UnitContentsItem,
  UnitContentsItemType,
  UnitContentsResult,
  UnitContentsSection,
} from './types';

const UNIT_CONTENTS_PATH = (unitId: string) => `/api/v1/progress/units/${unitId}/contents`;

/**
 * learning-service serializes `contentType` as its internal UPPERCASE
 * `ContentType` value (LESSON / VOCABULARY_LIST / GRAMMAR_RULE / EXERCISE /
 * CONTAINER), not content-service's lowercase `ContainerItemType` wire value.
 * The uppercase form is that service's convention on both directions —
 * `POST /progress` rejects anything else (`ContentRef.create` validates against
 * VALID_CONTENT_TYPES) — so we normalize on read here rather than asking the
 * platform to change its contract, and keep posting uppercase in `progress.ts`.
 */
function normalizeContentType(wire: string): UnitContentsItemType {
  return wire.toLowerCase() as UnitContentsItemType;
}

function normalizeItem(item: UnitContentsItem): UnitContentsItem {
  return { ...item, contentType: normalizeContentType(item.contentType) };
}

/**
 * `GET /progress/units/:moduleId/contents` (learning-service). Confirmed
 * against services/learning-service/src/modules/progress/presentation/
 * progress.controller.ts (`@Controller('progress') @Get('units/:moduleId/
 * contents')`) — single gateway endpoint, no client-side composition needed.
 */
export async function getUnitContents(unitId: string): Promise<UnitContentsResult> {
  const result = await apiClient.get<UnitContentsResult>(UNIT_CONTENTS_PATH(unitId));
  return {
    ...result,
    sections: result.sections.map(
      (section): UnitContentsSection => ({
        ...section,
        items: section.items.map(normalizeItem),
      }),
    ),
    ungroupedItems: result.ungroupedItems.map(normalizeItem),
  };
}
