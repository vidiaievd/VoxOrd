import { useMyCourses } from './useMyCourses';

/**
 * Whether the learner studies this course at a school (their enrolment carries one) — handed-in
 * work then goes to be read by its teacher. On their own nobody at a school reads it, so the
 * hand-in is only «Done» (OQ-S3 s19).
 *
 * While the course list is not there yet the answer is `true`: the school's words are the ones
 * that were always shown, and a learner on their own sees them only for that moment.
 */
export function useSchoolLearner(courseId: string): boolean {
  const { courses } = useMyCourses();
  const enrolment = courses.find((c) => c.enrollment.containerId === courseId)?.enrollment;
  if (enrolment === undefined) return true;
  return enrolment.schoolId !== null;
}
