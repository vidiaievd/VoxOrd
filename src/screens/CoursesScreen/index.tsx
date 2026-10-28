import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { useMyCourses } from '../../hooks/useMyCourses';
import { useCatalog } from '../../hooks/useCatalog';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, Overline, SegmentedControl, Skeleton } from '../../components/ui';
import { isNetworkError } from '../../api/isNetworkError';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import { getLastCourseId, setLastCourseId } from '../../store/lastCourseStore';
import { courseDownloader } from '../../services/courseDownload';
import type { Screen } from '../../navigation/screens';
import type { Container } from '../../api/types';
import { COURSES_FEATURES } from './features';
import { pickCurrent } from './courseMeta';
import { NowStudyingCard } from './NowStudyingCard';
import { MoreCourseRow, type CourseDownloadIcon } from './MoreCourseRow';
import { DownloadsRow } from './DownloadsRow';
import { CatalogList } from './CatalogList';

type Segment = 'mine' | 'catalog';

interface CoursesScreenProps {
  segment?: Segment;
  onCoursePress: (courseId: string) => void;
  onNavigate: (screen: Screen) => void;
}

export function CoursesScreen({ segment: initialSegment, onCoursePress, onNavigate }: CoursesScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { status, courses, error, refreshing, stale, refresh } = useMyCourses();
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop('Courses', scrollRef);

  const [segment, setSegment] = useState<Segment>(initialSegment ?? 'mine');
  const shown: Segment = COURSES_FEATURES.catalog ? segment : 'mine';
  // Loaded only once the segment is opened.
  const catalog = useCatalog(shown === 'catalog');
  const enrolledIds = useMemo(() => new Set(courses.map(c => c.container.id)), [courses]);

  const [lastId, setLastId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    getLastCourseId().then(setLastId);
  }, []);

  // A walk's progress moves the icons.
  const [, bump] = useState(0);
  useEffect(() => courseDownloader.subscribe(() => bump(n => n + 1)), []);

  const current = useMemo(
    () => (lastId === undefined ? null : pickCurrent(courses, lastId)),
    [courses, lastId],
  );
  const others = courses.filter(c => c.container.id !== current?.container.id);

  const downloadIcon = (courseId: string): CourseDownloadIcon => {
    const st = courseDownloader.getStatus();
    if (st.running) return 'downloading';
    return courseDownloader.isPinned(courseId) || (st.lastFinishedAt !== null && st.lastFailed === 0)
      ? 'done'
      : 'none';
  };

  const open = (courseId: string) => {
    void setLastCourseId(courseId);
    onCoursePress(courseId);
  };

  // A course already held opens as the learner's own (spec §4.2).
  const openFromCatalog = (course: Container) =>
    enrolledIds.has(course.id)
      ? open(course.id)
      : onNavigate({ name: 'CatalogCourse', containerId: course.id });

  const onRefresh = () => (shown === 'catalog' ? catalog.refresh() : refresh());
  const offline =
    shown === 'catalog' ? catalog.stale && isNetworkError(catalog.error) : stale && isNetworkError(error);

  const gutter = spacing.screenGutter;
  const loaded = status === 'loaded' && lastId !== undefined;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: 14, paddingHorizontal: gutter, paddingBottom: 24, gap: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={shown === 'catalog' ? catalog.refreshing : refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accentBase}
          />
        }
      >
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          {t('courses.title')}
        </Text>

        {COURSES_FEATURES.catalog && (
          <SegmentedControl
            options={[
              { value: 'mine' as const, label: t('coursesTab.mine') },
              { value: 'catalog' as const, label: t('coursesTab.catalog') },
            ]}
            value={shown}
            onChange={setSegment}
          />
        )}

        {offline && <OfflineBanner />}

        {shown === 'catalog' && (
          <CatalogList
            catalog={catalog}
            current={current?.container ?? null}
            enrolledIds={enrolledIds}
            onOpen={openFromCatalog}
            onFindSchool={() => onNavigate({ name: 'FindSchool' })}
          />
        )}

        {shown === 'mine' && (status === 'loading' || (status === 'loaded' && lastId === undefined)) && (
          <View style={{ gap: 14 }}>
            <Skeleton height={190} radius={14} />
            <Skeleton width={90} height={11} />
            <Skeleton height={92} radius={14} />
          </View>
        )}

        {shown === 'mine' && status === 'error' && (
          <View style={{ gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
            <Text style={[typography.cardTitleMedium, { color: colors.text }]}>{t('courses.loadError')}</Text>
            <Text style={[typography.secondary, { color: colors.neutral500 }]}>{error?.message}</Text>
            <Button variant="secondary" size={44} label={t('courses.retry')} onPress={refresh} />
          </View>
        )}

        {shown === 'mine' && loaded && courses.length === 0 && (
          <View style={{ gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
            <Text style={{ ...typography.cardTitleMedium, fontSize: 18, color: colors.text }}>
              {t('courses.noCoursesYet')}
            </Text>
            <Text style={[typography.body, { color: colors.neutral400 }]}>{t('courses.noCoursesYetDesc')}</Text>
            {COURSES_FEATURES.catalog && (
              <Button label={t('coursesTab.openCatalog')} onPress={() => setSegment('catalog')} />
            )}
          </View>
        )}

        {shown === 'mine' && loaded && current && (
          <>
            <NowStudyingCard
              item={current}
              onOpenCourse={open}
              onNavigate={(screen, courseId) => {
                void setLastCourseId(courseId);
                onNavigate(screen);
              }}
            />
            {others.length > 0 && (
              <>
                <View style={{ marginTop: 4 }}>
                  <Overline>{t('coursesTab.moreCourses')}</Overline>
                </View>
                {others.map(item => (
                  <MoreCourseRow
                    key={item.enrollment.id}
                    item={item}
                    download={downloadIcon(item.container.id)}
                    onPress={() => open(item.container.id)}
                  />
                ))}
              </>
            )}
            <DownloadsRow courseCount={courses.length} onPress={() => onNavigate({ name: 'Settings' })} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
