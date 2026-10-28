import { useEffect, useState } from 'react';
import { getCourseUnitIds } from '../api/courseHome';
import { getDueGrammarRules } from '../api/grammarReview';
import {
  GRAMMAR_ROWS,
  pickGrammarRows,
  type CourseGrammarDue,
  type GrammarDueRowData,
} from '../lib/grammarDue';
import { PRACTICE_FEATURES } from '../screens/PracticeScreen/features';
import { useMyCourses } from './useMyCourses';

export interface GrammarDue {
  /** At most three, lowest mastery first. */
  rows: GrammarDueRowData[];
  /** Every due rule the phone can show — the hero's «N rules». */
  total: number;
}

/**
 * «Grammar to review» on the Practice root (Practice §6.3, plan 05 step 7): the due rules of
 * every active course, merged. One request per course, and the course's unit order only for
 * a course that has a due rule. A course that fails is left out; `null` when every course
 * failed or the switch is off — the section is then not drawn.
 */
export function useGrammarDue(nonce: number): GrammarDue | null {
  const { courses } = useMyCourses();
  const [due, setDue] = useState<GrammarDue | null>(null);
  const courseKey = courses.map(c => c.container.id).join(',');

  useEffect(() => {
    if (!PRACTICE_FEATURES.grammarDue || courses.length === 0) {
      setDue(null);
      return;
    }
    let live = true;
    Promise.allSettled(
      courses.map(async ({ container }): Promise<CourseGrammarDue> => {
        const rules = await getDueGrammarRules(container.id);
        const unitIds = rules.length === 0 ? [] : await getCourseUnitIds(container);
        return { courseId: container.id, rules, unitIds };
      }),
    ).then(results => {
      if (!live) return;
      const loaded = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []));
      if (loaded.length === 0) {
        setDue(null);
        return;
      }
      const all = pickGrammarRows(loaded, new Date(), Infinity);
      setDue({ rows: all.slice(0, GRAMMAR_ROWS), total: all.length });
    });
    return () => {
      live = false;
    };
    // `courseKey` stands for `courses`: the cached list is a new array on every revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseKey, nonce]);

  return due;
}
