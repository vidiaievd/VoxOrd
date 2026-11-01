import { useCallback } from 'react';
import { getEntitlements } from '../api/entitlements';
import { getPrecheckSetting } from '../api/precheck';
import { useAuth } from './useAuth';
import { useMyCourses } from './useMyCourses';
import { useSwrResource } from './useSwrResource';

/** The feature key a school's plan needs before its learners rehearse with a model. */
const FEATURE = 'ai.practice';

/**
 * Whether «Check» with a model is drawn for the exercises of this course (platform plan 84,
 * VoxOrd step 7).
 *
 * The rehearsal is a school's: the school pays, and it has to have switched it on
 * (`GET schools/:id/ai-precheck`) and have `ai.practice` in its plan. Which school is the
 * learner's enrolment in the course; a self-study course has none, so nothing is drawn. This
 * only hides a button — the engine checks the same things and refuses with 403 (or answers
 * `refused`), so a wrong guess here lets nothing in. Offline nothing is drawn: the model is
 * on the server, and a take or draft that exists only on the phone cannot be sent to it.
 */
export function usePrecheckAvailability(courseId: string): boolean {
  const { status: authStatus, user, offline } = useAuth();
  const { courses } = useMyCourses();
  const schoolId =
    courses.find((c) => c.enrollment.containerId === courseId && c.enrollment.schoolId !== null)?.enrollment
      .schoolId ?? null;
  const key =
    authStatus === 'signedIn' && user && schoolId !== null ? `precheck-avail:${user.id}:${schoolId}` : null;

  const loader = useCallback(async (): Promise<boolean> => {
    const [setting, rights] = await Promise.all([
      getPrecheckSetting(schoolId as string),
      getEntitlements(schoolId as string),
    ]);
    return setting?.enabled === true && rights?.features[FEATURE]?.enabled === true;
    // The school is read through the key: a new object with the same id asks nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const { data } = useSwrResource<boolean>(key, loader);
  return key !== null && !offline && data === true;
}
