import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { useModal } from '../../providers/ModalProvider';
import { spacing } from '../../theme/spacing';
import { useCourseHome } from '../../hooks/useCourseHome';
import { useCourseReviewSets } from '../../hooks/useCourseReviewSets';
import { useMyCourses } from '../../hooks/useMyCourses';
import { useNextInCourse } from '../../hooks/useNextInCourse';
import { useRefreshOnForeground } from '../../hooks/useRefreshOnForeground';
import { unitContentsResource } from '../../lib/courseResources';
import { getMemoryCache, readCacheSnapshot } from '../../lib/swrCache';
import { leaveEnrollment } from '../../api/courses';
import { courseDownloader } from '../../services/courseDownload';
import { OfflineBanner } from '../../components/OfflineBanner';
import { Button, NavHeader, ProgressTrack, Skeleton, useToast } from '../../components/ui';
import { isNetworkError } from '../../api/isNetworkError';
import type { UnitSummary } from '../../api/types';
import { UnitRow } from './UnitRow';
import { CourseTiles, SkillsBlock } from './CourseStatsSection';

interface CourseHomeScreenProps {
  courseId: string;
  onBack: () => void;
  onUnitPress: (unitId: string) => void;
  onReviewPress: () => void;
}

/** Whether the skills block is open, remembered per course while the app runs (spec §6.2). */
const skillsOpen = new Map<string, boolean>();

type MenuAction = 'download' | 'release' | 'leave';

export function CourseHomeScreen({
  courseId,
  onBack,
  onUnitPress,
  onReviewPress,
}: CourseHomeScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const toast = useToast();
  const modal = useModal();
  const { status, data, error, refreshing, stale, refresh } = useCourseHome(courseId);
  // `data.srsDueCount` comes from the global, unfiltered `/srs/stats/me` stat
  // (see the caveat in `src/api/courseHome.ts`) and can be nonzero while the
  // "Повторить" screen has nothing runnable — it also counts EXERCISE cards
  // and VOCABULARY_WORD cards whose list was never imported locally. Use the
  // same resolved-against-local-decks count the review screen itself runs on,
  // so the counter never promises a session that turns out empty.
  const { overview: reviewOverview } = useCourseReviewSets();
  const myCourses = useMyCourses();
  const net = useNetInfo();
  useRefreshOnForeground(refresh);

  // Offline, a unit whose contents were never kept cannot open: say so instead of showing a
  // load error on the next screen.
  const pressUnit = async (unitId: string) => {
    if (net.isConnected === false) {
      const key = unitContentsResource(unitId).key;
      const kept = getMemoryCache(key) !== undefined || (await readCacheSnapshot(key)) !== null;
      if (!kept) {
        toast.show(t('courseHome.unitNotSaved'));
        return;
      }
    }
    onUnitPress(unitId);
  };
  const next = useNextInCourse(data?.units ?? null);
  const [open, setOpen] = useState(skillsOpen.get(courseId) ?? true);

  // Only a self-study enrollment can be left from here; a school's belongs to the school.
  const selfStudy = useMemo(
    () =>
      myCourses.courses.find(
        c => c.enrollment.containerId === courseId && c.enrollment.schoolId === null,
      )?.enrollment ?? null,
    [myCourses.courses, courseId],
  );

  const toggleSkills = () => {
    const value = !open;
    skillsOpen.set(courseId, value);
    setOpen(value);
  };

  const units = useMemo(
    () => [...(data?.units ?? [])].sort((a, b) => a.position - b.position),
    [data],
  );

  const leave = () => {
    if (!selfStudy) return;
    modal.show({
      type: 'confirm',
      title: t('courseHome.leaveTitle'),
      message: t('courseHome.leaveMessage', { course: data?.courseInfo.title ?? '' }),
      confirmLabel: t('courseHome.leaveConfirm'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => {
        leaveEnrollment(selfStudy.id)
          .then(async () => {
            await courseDownloader.releaseCourse(courseId).catch(() => {});
            myCourses.refresh().catch(() => {});
            onBack();
          })
          .catch(() => toast.show(t('courseHome.leaveFailed')));
      },
    });
  };

  const onAction = (action: MenuAction) => {
    if (action === 'download') {
      toast.show(t('courseHome.downloadStarted'));
      courseDownloader.downloadCourse(courseId).catch(() => toast.show(t('courseHome.downloadFailed')));
    } else if (action === 'release') {
      courseDownloader.releaseCourse(courseId).catch(() => {});
      toast.show(t('courseHome.removed'));
    } else {
      // The picker closes itself right after this; a sheet opened at once would be closed with it.
      setTimeout(leave, 300);
    }
  };

  const openMenu = () => {
    const options: { value: MenuAction; label: string }[] = [
      courseDownloader.isPinned(courseId)
        ? { value: 'release', label: t('courseHome.removeFromPhone') }
        : { value: 'download', label: t('courseHome.downloadCourse') },
    ];
    if (selfStudy) options.push({ value: 'leave', label: t('courseHome.leaveCourse') });
    modal.show({
      type: 'picker',
      title: data?.courseInfo.title ?? t('courses.title'),
      options,
      current: null,
      closeLabel: t('common.close'),
      onSelect: onAction,
    });
  };

  const meta = data
    ? [data.courseInfo.cefrLevel, data.courseInfo.targetLanguage.toUpperCase(), data.courseInfo.schoolName]
        .filter(Boolean)
        .join(' · ')
    : '';
  const pct = data ? Math.round(data.progress.percentComplete) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <NavHeader
        parentLabel={t('courses.title')}
        onBack={onBack}
        right={
          status === 'loaded'
            ? { icon: 'DotsThree', accessibilityLabel: t('courseHome.menu'), onPress: openMenu }
            : undefined
        }
      />

      {stale && isNetworkError(error) && <OfflineBanner />}

      {status === 'loading' && (
        <View style={{ paddingHorizontal: spacing.screenGutter, paddingTop: 4, gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Skeleton width={140} height={12} />
            <Skeleton width="75%" height={28} />
            <Skeleton width="100%" height={4} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Skeleton height={84} radius={14} style={{ flex: 1, width: undefined }} />
            <Skeleton height={84} radius={14} style={{ flex: 1, width: undefined }} />
          </View>
          <View style={{ gap: 8 }}>
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} height={56} radius={8} />
            ))}
          </View>
        </View>
      )}

      {status === 'error' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 }}>
          <Text style={[typography.cardTitleMedium, { color: colors.text, textAlign: 'center' }]}>
            {t('courseHome.loadError')}
          </Text>
          <Text style={[typography.secondary, { color: colors.neutral500, textAlign: 'center' }]}>
            {error?.message}
          </Text>
          <Button variant="secondary" size={44} label={t('courses.retry')} onPress={refresh} />
        </View>
      )}

      {status === 'loaded' && data && (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.screenGutter,
            paddingTop: 4,
            paddingBottom: 24,
            gap: 16,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accentBase} />
          }
        >
          <View style={{ gap: 4 }}>
            <Text style={[typography.meta, { color: colors.neutral500 }]}>{meta}</Text>
            <Text style={[typography.h1, { color: colors.text }]}>{data.courseInfo.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <ProgressTrack value={pct / 100} />
              </View>
              <Text style={[typography.meta, { color: colors.neutral400 }]}>{pct}%</Text>
            </View>
          </View>

          {units.length > 0 && (
            <>
              <CourseTiles
                totalDue={reviewOverview?.totalDue ?? 0}
                mastery={data.mastery}
                onReviewPress={onReviewPress}
                onSkillsPress={toggleSkills}
              />
              {open && data.mastery.bySkill.length > 0 && <SkillsBlock mastery={data.mastery} />}

              <Text style={[typography.cardTitleMedium, { color: colors.text }]}>
                {t('courseHome.units')}
              </Text>
              <View style={{ gap: 8 }}>
                {units.map((unit: UnitSummary, index) => (
                  <UnitRow
                    key={unit.id}
                    unit={unit}
                    number={index + 1}
                    isNext={unit.id === next.unitId}
                    nextTitle={unit.id === next.unitId ? next.title : null}
                    onPress={() => void pressUnit(unit.id)}
                    onLockedPress={() => toast.show(t('courseHome.lockedReason'))}
                  />
                ))}
              </View>
            </>
          )}

          {units.length === 0 && (
            <Text style={[typography.body, { color: colors.neutral500, textAlign: 'center', marginTop: 24 }]}>
              {t('courseHome.noUnits')}
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
