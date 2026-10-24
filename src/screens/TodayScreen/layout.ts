import type { HomeVariant } from './variant';

export type HomeBlockId =
  | 'offline'
  | 'header'
  | 'assistInline'
  | 'groupAccess'
  | 'resume'
  | 'aiPlan'
  | 'review'
  | 'teacherFeedback'
  | 'aiReviewed'
  | 'nextClass'
  | 'assignment'
  | 'goal'
  | 'soloWriting'
  | 'workOnThis'
  | 'catalogPicks'
  | 'assistSuggestions'
  | 'aiCredits';

/**
 * The order of Today's blocks per variant (Home spec §6.3). Each block decides for itself
 * whether it has anything to say; the screen only walks the list.
 */
export const HOME_LAYOUT: Record<HomeVariant, readonly HomeBlockId[]> = {
  school: ['offline', 'header', 'groupAccess', 'resume', 'review', 'teacherFeedback', 'nextClass', 'workOnThis'],
  solo: ['offline', 'header', 'resume', 'review', 'goal', 'soloWriting', 'workOnThis', 'catalogPicks'],
  school_ai: [
    'offline',
    'header',
    'assistInline',
    'groupAccess',
    'resume',
    'review',
    'teacherFeedback',
    'nextClass',
    'assignment',
  ],
  solo_ai: ['offline', 'header', 'aiPlan', 'aiReviewed', 'assistSuggestions', 'aiCredits'],
};

/** What stands in for a block that has nothing: no plan for today means Continue and Review. */
export const HOME_FALLBACK: Partial<Record<HomeBlockId, readonly HomeBlockId[]>> = {
  aiPlan: ['resume', 'review'],
};

/**
 * The blocks to render, with every block in `missing` replaced by its fallback — or dropped,
 * when it has none, since a block with nothing to say renders nothing anyway.
 */
export function layoutFor(
  variant: HomeVariant,
  missing: ReadonlySet<HomeBlockId> = new Set(),
): HomeBlockId[] {
  return HOME_LAYOUT[variant].flatMap((id) =>
    missing.has(id) ? [...(HOME_FALLBACK[id] ?? [])] : [id],
  );
}
