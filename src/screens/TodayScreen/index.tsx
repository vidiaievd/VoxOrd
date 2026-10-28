import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import type { DueCount } from '../../hooks/useDueCount';
import { classStart } from '../../api/nextClass';
import { useMyCourses } from '../../hooks/useMyCourses';
import { useNextClass } from '../../hooks/useNextClass';
import { useHomeVariant } from '../../hooks/useHomeVariant';
import { hasSchool } from './variant';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import type { Screen } from '../../navigation/screens';
import { useTheme } from '../../providers/ThemeProvider';
import { getLastCourseId, setLastCourseId } from '../../store/lastCourseStore';
import { spacing } from '../../theme/spacing';
import { AssistInline } from './blocks/AssistInline';
import { Assignment } from './blocks/Assignment';
import { FirstRun } from './blocks/FirstRun';
import { GroupAccess } from './blocks/GroupAccess';
import { Header } from './blocks/Header';
import { NextClass } from './blocks/NextClass';
import { OfflineCard } from './blocks/OfflineCard';
import { SoloWriting } from './blocks/SoloWriting';
import { Review } from './blocks/Review';
import { Resume } from './blocks/Resume';
import { ResumeSkeleton } from './blocks/Skeleton';
import { TeacherFeedback } from './blocks/TeacherFeedback';
import { WorkOnThis } from './blocks/WorkOnThis';
import { layoutFor, type HomeBlockId } from './layout';
import { pickCourseId } from './today';
import { RefreshRegistry } from './refresh';

interface TodayScreenProps {
  due: DueCount;
  onNavigate: (screen: Screen) => void;
  /** Switch to a tab's root. */
  onOpenTab: (tab: 'Courses' | 'Practice' | 'Profile') => void;
}

/** Blocks that stay when there are no courses: the rest give way to the first-run card. */
const KEPT_WITHOUT_COURSES: ReadonlySet<HomeBlockId> = new Set([
  'offline',
  'header',
  'assistInline',
  'groupAccess',
]);

/** Blocks of the layouts that are not built yet; `layoutFor` swaps in the fallback or drops them. */
const NOT_BUILT: ReadonlySet<HomeBlockId> = new Set([
  'aiPlan',
  'aiReviewed',
  'assistSuggestions',
  'aiCredits',
  'goal',
  'catalogPicks',
]);

/**
 * «Today» (Home spec §6): walks the layout of its variant, and each block loads its own data
 * and shows nothing when it has nothing to say.
 *
 * Variants A, B and C are walked, C with its assistant entries (plan 03 step 3); D's blocks
 * are plan 03 step 4, so a block that does not exist yet is left out and D falls back to
 * Continue and Review.
 */
export function TodayScreen({ due, onNavigate, onOpenTab }: TodayScreenProps) {
  const { colors } = useTheme();
  const { user, offline } = useAuth();
  const courses = useMyCourses();
  const home = useHomeVariant();
  const { schools } = home;
  const next = useNextClass(schools);
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
        home.refresh(),
        next.refresh(),
        due.refresh(),
        ...[...registry].map((run) => run()),
      ]);
    } finally {
      setPulling(false);
    }
  }, [courses, home, next, due, registry]);

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

  const { variant } = home;
  // Variant C offers the assistant beside the teacher's review and the class; each link asks
  // the server about its own context before it is drawn.
  const offerAssist = variant === 'school_ai';
  const ids = useMemo(() => {
    const layout = layoutFor(variant, NOT_BUILT);
    return noCourses
      ? [...layout.filter((id) => KEPT_WITHOUT_COURSES.has(id)), 'first' as const]
      : layout;
  }, [variant, noCourses]);

  // AI blocks arrive after the first paint (entitlements load later); ease the others down
  // once instead of jumping. Not on the first layout, and not on every pull.
  const shownVariant = useRef(variant);
  useEffect(() => {
    if (shownVariant.current !== variant) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      shownVariant.current = variant;
    }
  }, [variant]);

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
      case 'assistInline':
        // Waits for the course «Continue» leads into, so it does not open on another one.
        return lastId === undefined || (courses.status === 'loading' && courseIds.length === 0) ? null : (
          <AssistInline key={id} courseId={leadId} onNavigate={onNavigate} />
        );
      case 'groupAccess':
        return <GroupAccess key={id} schools={schools} onOpenCourse={openCourse} />;
      case 'teacherFeedback':
        return (
          <TeacherFeedback
            key={id}
            offline={offline}
            showAiDrafted={home.caps.reviewDraft}
            offerAssist={offerAssist}
            onNavigate={onNavigate}
          />
        );
      case 'nextClass':
        return (
          <NextClass key={id} nextClass={nextClass} offerAssist={offerAssist} onNavigate={onNavigate} />
        );
      case 'assignment':
        return <Assignment key={id} />;
      case 'soloWriting':
        return (
          <SoloWriting
            key={id}
            onConnectAi={() => onOpenTab('Profile')}
            onFindSchool={() => onOpenTab('Courses')}
          />
        );
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
            inSchool={hasSchool(schools)}
            offline={offline}
            onOpenCourses={() => onOpenTab('Courses')}
          />
        );
      default:
        // Goal has no data, CatalogPicks waits for plan 04, the rest is plan 03.
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
