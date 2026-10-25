import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import type { DueCount } from '../../hooks/useDueCount';
import { classStart } from '../../api/nextClass';
import { useMyCourses } from '../../hooks/useMyCourses';
import { useNextClass } from '../../hooks/useNextClass';
import { useSchools } from '../../hooks/useSchools';
import { hasSchool } from './variant';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import type { Screen } from '../../navigation/screens';
import { useTheme } from '../../providers/ThemeProvider';
import { getLastCourseId, setLastCourseId } from '../../store/lastCourseStore';
import { spacing } from '../../theme/spacing';
import { Assignment } from './blocks/Assignment';
import { FirstRun } from './blocks/FirstRun';
import { GroupAccess } from './blocks/GroupAccess';
import { Header } from './blocks/Header';
import { NextClass } from './blocks/NextClass';
import { OfflineCard } from './blocks/OfflineCard';
import { Review } from './blocks/Review';
import { Resume } from './blocks/Resume';
import { ResumeSkeleton } from './blocks/Skeleton';
import { TeacherFeedback } from './blocks/TeacherFeedback';
import { WorkOnThis } from './blocks/WorkOnThis';
import { HOME_LAYOUT, type HomeBlockId } from './layout';
import { pickCourseId } from './today';
import { RefreshRegistry } from './refresh';

interface TodayScreenProps {
  due: DueCount;
  onNavigate: (screen: Screen) => void;
  /** Switch to a tab's root. */
  onOpenTab: (tab: 'Courses' | 'Practice') => void;
}

/** Blocks that stay when there are no courses: the rest give way to the first-run card. */
const KEPT_WITHOUT_COURSES: ReadonlySet<HomeBlockId> = new Set([
  'offline',
  'header',
  'assistInline',
  'groupAccess',
]);

/**
 * «Today» (Home spec §6): walks the layout of its variant, and each block loads its own data
 * and shows nothing when it has nothing to say.
 *
 * Only variant A (school) is walked so far; the variant is resolved in step 7, and the
 * blocks it needs that do not exist yet render nothing.
 */
export function TodayScreen({ due, onNavigate, onOpenTab }: TodayScreenProps) {
  const { colors } = useTheme();
  const { user, offline } = useAuth();
  const courses = useMyCourses();
  const schools = useSchools();
  const next = useNextClass(schools.schools);
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop('Today', scrollRef);

  const [lastId, setLastId] = useState<string | null | undefined>(undefined);
  React.useEffect(() => {
    getLastCourseId().then(setLastId);
  }, []);

  const registry = useRef(new Set<() => Promise<void>>()).current;
  const [pulling, setPulling] = useState(false);
  const refresh = useCallback(async () => {
    setPulling(true);
    try {
      await Promise.all([
        courses.refresh(),
        schools.refresh(),
        next.refresh(),
        due.refresh(),
        ...[...registry].map((run) => run()),
      ]);
    } finally {
      setPulling(false);
    }
  }, [courses, schools, next, due, registry]);

  const openCourse = useCallback(
    (courseId: string) => {
      void setLastCourseId(courseId);
      onNavigate({ name: 'CourseHome', courseId });
    },
    [onNavigate],
  );
  // A cancelled class is not the day's news.
  const nextClass = next.nextClass?.status === 'cancelled' ? null : next.nextClass;

  const courseIds = courses.courses.map((c) => c.container.id);
  const leadId = lastId === undefined ? null : pickCourseId(courseIds, lastId);
  const noCourses = courses.status === 'loaded' && courseIds.length === 0;
  const name = user?.email?.split('@')[0] ?? null;

  const ids = useMemo(() => {
    const layout = HOME_LAYOUT.school;
    return noCourses
      ? [...layout.filter((id) => KEPT_WITHOUT_COURSES.has(id)), 'first' as const]
      : layout;
  }, [noCourses]);

  const renderBlock = (id: HomeBlockId | 'first') => {
    switch (id) {
      case 'header':
        return (
          <Header
            key={id}
            name={name}
            offline={offline}
            // Until the list is known, do not greet a learner who has courses as a newcomer.
            hasCourses={courses.status !== 'loaded' || courseIds.length > 0}
            dueCount={due.count ?? 0}
            nextClassAt={nextClass ? classStart(nextClass) : null}
          />
        );
      case 'groupAccess':
        return <GroupAccess key={id} schools={schools.schools} onOpenCourse={openCourse} />;
      case 'teacherFeedback':
        return <TeacherFeedback key={id} offline={offline} onNavigate={onNavigate} />;
      case 'nextClass':
        return <NextClass key={id} nextClass={nextClass} />;
      case 'assignment':
        return <Assignment key={id} />;
      case 'workOnThis':
        return <WorkOnThis key={id} onOpenPractice={() => onOpenTab('Practice')} />;
      case 'resume':
        if (leadId) {
          return <Resume key={id} courseId={leadId} offline={offline} onNavigate={onNavigate} />;
        }
        return courses.status === 'loading' || lastId === undefined ? (
          <ResumeSkeleton key={id} />
        ) : null;
      case 'review':
        return (
          <Review
            key={id}
            due={due}
            onOpenPractice={() => onOpenTab('Practice')}
            onStart={() => onNavigate({ name: 'ReviewSession' })}
          />
        );
      case 'first':
        return (
          <FirstRun
            key={id}
            inSchool={hasSchool(schools.schools)}
            offline={offline}
            onOpenCourses={() => onOpenTab('Courses')}
          />
        );
      default:
        // Blocks of step 7 and plan 03 render nothing yet.
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      {ids.includes('offline') ? <OfflineCard /> : null}
      <RefreshRegistry.Provider value={registry}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={pulling}
              onRefresh={refresh}
              tintColor={colors.accentBase}
            />
          }
        >
          {ids.filter((id) => id !== 'offline').map(renderBlock)}
        </ScrollView>
      </RefreshRegistry.Provider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: 14,
    paddingBottom: 24,
    gap: spacing.blockGap,
  },
});
