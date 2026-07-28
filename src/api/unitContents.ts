import { apiClient } from './client';
import { getGrammarRuleMastery } from './mastery';
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
  return { ...item, contentType: normalizeContentType(item.contentType), masteryPercent: null };
}

/**
 * Grammar rules have no per-rule mastery in the contents payload itself (it's
 * a separate roll-up, see `getGrammarRuleMastery`). Fetched per-item and
 * attached in place; a failure on one rule never blocks the others or the
 * rest of the screen — same non-fatal convention as course mastery in
 * `courseHome.ts`.
 */
async function attachGrammarRuleMastery(items: UnitContentsItem[]): Promise<UnitContentsItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.contentType !== 'grammar_rule') return item;
      try {
        const mastery = await getGrammarRuleMastery(item.contentId);
        return { ...item, masteryPercent: mastery.masteryPercent };
      } catch (e) {
        console.warn(`[UnitContents] Failed to load grammar mastery for ${item.contentId}:`, e);
        return item;
      }
    }),
  );
}

/**
 * `GET /progress/units/:moduleId/contents` (learning-service). Confirmed
 * against services/learning-service/src/modules/progress/presentation/
 * progress.controller.ts (`@Controller('progress') @Get('units/:moduleId/
 * contents')`) — single gateway endpoint, no client-side composition needed.
 */
export async function getUnitContents(unitId: string): Promise<UnitContentsResult> {
  const result = await apiClient.get<UnitContentsResult>(UNIT_CONTENTS_PATH(unitId));
  const sections = await Promise.all(
    result.sections.map(
      async (section): Promise<UnitContentsSection> => ({
        ...section,
        items: await attachGrammarRuleMastery(section.items.map(normalizeItem)),
      }),
    ),
  );
  return {
    ...result,
    sections,
    ungroupedItems: await attachGrammarRuleMastery(result.ungroupedItems.map(normalizeItem)),
  };
}
