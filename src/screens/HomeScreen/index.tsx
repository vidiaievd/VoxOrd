import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { useMyCourses } from '../../hooks/useMyCourses';
import { useCourseHome } from '../../hooks/useCourseHome';
import { useSwrResource } from '../../hooks/useSwrResource';
import { getSrsStats, type SrsStats } from '../../api/srs';
import { getLastCourseId } from '../../store/lastCourseStore';
import { nextUnit, pickCourseId } from './today';

interface HomeScreenProps {
  onOpenCourse: (courseId: string) => void;
  onOpenUnit: (unitId: string, courseId: string) => void;
  onStartReview: () => void;
  onAllCourses: () => void;
}

/** How many courses Home lists before «All courses» takes over. */
const COURSES_ON_HOME = 3;

/**
 * «Today» — what to do now, in the order it is worth doing: carry on with the course, go over
 * what is due, or open another course.
 *
 * Home was the word decks, which are gone; the courses are the app now, so Home leads into
 * them instead of standing beside them.
 */
export function HomeScreen({ onOpenCourse, onOpenUnit, onStartReview, onAllCourses }: HomeScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { user } = useAuth();
  const courses = useMyCourses();
  const srs = useSwrResource<SrsStats>('srs-stats', getSrsStats);

  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => {
    getLastCourseId().then(setLastId);
  }, []);

  const courseIds = courses.courses.map((c) => c.container.id);
  const leadId = pickCourseId(courseIds, lastId);
  const name = user?.email?.split('@')[0] ?? null;

  const refreshing = courses.refreshing || srs.refreshing;
  const refresh = useCallback(async () => {
    await Promise.all([courses.refresh(), srs.refresh()]);
  }, [courses, srs]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <Text style={styles.greeting}>
          {name ? t('today.greeting', { name }) : t('today.greetingPlain')}
        </Text>
        <Text style={styles.subtitle}>{t('today.subtitle')}</Text>

        {courses.status === 'loading' ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : leadId ? (
          <ContinueCard courseId={leadId} onOpenUnit={onOpenUnit} onOpenCourse={onOpenCourse} />
        ) : courses.status === 'loaded' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('today.noCourses')}</Text>
            <Text style={styles.cardMuted}>{t('today.noCoursesDesc')}</Text>
          </View>
        ) : null}

        <ReviewCard stats={srs.data} onStart={onStartReview} />

        {courses.courses.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{t('today.myCourses')}</Text>
              <TouchableOpacity onPress={onAllCourses}>
                <Text style={styles.link}>{t('today.allCourses')}</Text>
              </TouchableOpacity>
            </View>
            {courses.courses.slice(0, COURSES_ON_HOME).map(({ container }) => (
              <TouchableOpacity
                key={container.id}
                style={styles.courseRow}
                onPress={() => onOpenCourse(container.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.courseTitle} numberOfLines={1}>
                  {container.title}
                </Text>
                <Text style={styles.courseLevel}>{container.difficultyLevel}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The course to carry on with: its next unit and how far into it the learner is. */
function ContinueCard({
  courseId,
  onOpenUnit,
  onOpenCourse,
}: {
  courseId: string;
  onOpenUnit: (unitId: string, courseId: string) => void;
  onOpenCourse: (courseId: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { data } = useCourseHome(courseId);

  const unit = data ? nextUnit(data.units) : null;
  const ratio = unit && unit.totalLessons > 0 ? unit.completedLessons / unit.totalLessons : 0;

  return (
    <TouchableOpacity
      style={[styles.card, styles.continueCard]}
      activeOpacity={0.85}
      onPress={() => (unit ? onOpenUnit(unit.id, courseId) : onOpenCourse(courseId))}
    >
      <Text style={styles.eyebrow}>{t('today.continue')}</Text>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {data?.courseInfo.title ?? ' '}
      </Text>
      {unit ? (
        <>
          <Text style={styles.unitTitle} numberOfLines={2}>
            {unit.title}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
          </View>
          <Text style={styles.cardMuted}>
            {t('today.unitProgress', { done: unit.completedLessons, total: unit.totalLessons })}
          </Text>
        </>
      ) : (
        <ActivityIndicator color={colors.accent} style={styles.cardSpinner} />
      )}
      <View style={styles.cta}>
        <Text style={styles.ctaText}>{t('today.continueCta')}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** What is due for review today, and the way into it. */
function ReviewCard({ stats, onStart }: { stats: SrsStats | null; onStart: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const due = stats?.dueNowCount ?? 0;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{t('today.reviewTitle')}</Text>
      <Text style={styles.cardTitle}>
        {stats === null
          ? ' '
          : due > 0
            ? t('today.reviewDue', { count: due })
            : t('today.reviewNone')}
      </Text>
      {stats !== null && stats.reviewedTodayCount > 0 ? (
        <Text style={styles.cardMuted}>
          {t('today.reviewedToday', { count: stats.reviewedTodayCount })}
        </Text>
      ) : null}
      {due > 0 ? (
        <TouchableOpacity style={styles.cta} onPress={onStart}>
          <Text style={styles.ctaText}>{t('today.reviewStart')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      padding: 16,
      paddingBottom: 32,
    },
    greeting: {
      fontSize: 26,
      fontWeight: '800',
      color: colors.textPrimary,
      marginTop: 8,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: 16,
    },
    loader: {
      paddingVertical: 32,
    },
    card: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.backgroundCard,
      marginBottom: 12,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 3,
    },
    continueCard: {
      borderWidth: 1,
      borderColor: colors.accent,
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.accent,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    unitTitle: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 4,
    },
    cardMuted: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 6,
    },
    cardSpinner: {
      marginTop: 12,
      alignSelf: 'flex-start',
    },
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginTop: 12,
    },
    fill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    cta: {
      marginTop: 14,
      alignSelf: 'flex-start',
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    ctaText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textInverted,
    },
    section: {
      marginTop: 12,
    },
    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    link: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.accent,
    },
    courseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.backgroundCard,
      marginBottom: 8,
    },
    courseTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    courseLevel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      marginLeft: 8,
    },
  });
