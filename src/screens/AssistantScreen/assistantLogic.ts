import type { AssistCitation, AssistContext, SendOutcome } from '../../api/assistant';
import type { LanguageCode } from '../../db/types';
import type { Screen } from '../../navigation/screens';

/* ─────────────────────────────────────────────────────────────────────────
 * What the assistant screen decides without drawing anything (mobile redesign 03, step 2).
 * ────────────────────────────────────────────────────────────────────── */

/** The context's course, when its kind names one. */
export function contextCourseId(context: AssistContext): string | null {
  return context.kind === 'free' ? null : context.courseId ?? null;
}

/**
 * The course screen a citation opens, coming back to `returnTo` (the thread), or null when
 * this app has no screen for it — the citation is then read, not tapped.
 *
 * The server's sources are not all addressed alike: a rule read on its own carries its course
 * and no unit, so the unit open in the context stands in when the course is the same; a word
 * is addressed by itself, never by its list, so a course word opens its unit's contents and a
 * learner's own word — the one kind without a course — opens «My words» (owner's decision
 * 2026-10-28, against the spec's «→ VocabularyList»).
 */
export function citationTarget(
  citation: AssistCitation,
  context: AssistContext,
  returnTo: Screen,
): Screen | null {
  const courseId = citation.courseId;
  const unitId =
    citation.unitId ??
    (context.kind === 'unit' && context.courseId === courseId ? context.unitId : null);

  switch (citation.kind) {
    case 'unit':
      return courseId ? { name: 'UnitContents', unitId: citation.id, courseId, returnTo } : null;
    case 'lesson':
      return courseId && unitId
        ? { name: 'LessonReader', lessonId: citation.id, unitId, courseId, returnTo }
        : null;
    case 'grammar_rule':
      return courseId && unitId
        ? { name: 'GrammarRuleReader', ruleId: citation.id, unitId, courseId, returnTo }
        : null;
    case 'vocabulary_item':
      if (courseId === null) return { name: 'MyWords', returnTo };
      return unitId ? { name: 'UnitContents', unitId, courseId, returnTo } : null;
  }
}

export interface Segment {
  text: string;
  stressed: boolean;
}

/**
 * A block's text cut at its emphasis ranges. The ranges come checked from the parser — in
 * order, inside the text, not overlapping — so this only cuts.
 */
export function emphasisSegments(
  text: string,
  emphasis: ReadonlyArray<readonly [number, number]>,
): Segment[] {
  const segments: Segment[] = [];
  let at = 0;
  for (const [start, end] of emphasis) {
    if (start > at) segments.push({ text: text.slice(at, start), stressed: false });
    segments.push({ text: text.slice(start, end), stressed: true });
    at = end;
  }
  if (at < text.length) segments.push({ text: text.slice(at), stressed: false });
  return segments;
}

/** How a turn that brought no answer is told — never in red, never with invented text. */
export type Unanswered = Exclude<SendOutcome['kind'], 'answer'>;

/** Whether asking again could help: a refusal stands until something changes on the server. */
export function canRetry(kind: Unanswered): boolean {
  return kind !== 'refused';
}

const SPEECH_LOCALES: Record<LanguageCode, string> = {
  ru: 'ru-RU',
  uk: 'uk-UA',
  en: 'en-US',
  pl: 'pl-PL',
  lt: 'lt-LT',
  no: 'nb-NO',
};

/** The recogniser's locale for the learner's interface language — they ask in their own. */
export function speechLocale(uiLanguage: LanguageCode): string {
  return SPEECH_LOCALES[uiLanguage];
}
