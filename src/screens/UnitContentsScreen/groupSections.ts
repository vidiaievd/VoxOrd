import type { UnitContentsItem, UnitContentsResult } from '../../api/types';

export type SectionKind = 'texts' | 'wordsGrammar' | 'exercises' | 'other';

export interface UnitSection {
  key: string;
  /** The server's title; null when the client grouped the items and the screen names the group. */
  title: string | null;
  kind: SectionKind | null;
  data: UnitContentsItem[];
}

const KIND_BY_TYPE: Record<string, SectionKind> = {
  lesson: 'texts',
  vocabulary_list: 'wordsGrammar',
  grammar_rule: 'wordsGrammar',
  exercise: 'exercises',
};

const KIND_ORDER: SectionKind[] = ['texts', 'wordsGrammar', 'exercises', 'other'];

/** Items without a title of their own, grouped by what they are, in the spec's order. */
function groupByKind(items: UnitContentsItem[], keyPrefix: string): UnitSection[] {
  const byKind = new Map<SectionKind, UnitContentsItem[]>();
  for (const item of items) {
    const kind = KIND_BY_TYPE[item.contentType] ?? 'other';
    byKind.set(kind, [...(byKind.get(kind) ?? []), item]);
  }
  return KIND_ORDER.filter(kind => byKind.has(kind)).map(kind => ({
    key: `${keyPrefix}:${kind}`,
    title: null,
    kind,
    data: byKind.get(kind) ?? [],
  }));
}

/**
 * The sections a unit screen lists (Courses spec §7.2): the server's sections under their own
 * titles; a section or the ungrouped rest with no title is grouped by type instead —
 * «Texts», «Words & grammar», «Exercises · N». Empty sections are dropped.
 */
export function groupSections(contents: UnitContentsResult): UnitSection[] {
  const sections: UnitSection[] = [];
  for (const section of contents.sections) {
    if (section.items.length === 0) continue;
    if (section.title.trim() === '') {
      sections.push(...groupByKind(section.items, section.id));
    } else {
      sections.push({ key: section.id, title: section.title, kind: null, data: section.items });
    }
  }
  sections.push(...groupByKind(contents.ungroupedItems, 'ungrouped'));
  return sections;
}
