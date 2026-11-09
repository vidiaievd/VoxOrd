import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import { Button, Card, ProgressTrack, Tag } from '../../components/ui';
import { useCourseHome } from '../../hooks/useCourseHome';
import { useNextInCourse } from '../../hooks/useNextInCourse';
import { openContentItem } from '../../lib/openContentItem';
import type { CourseListItem } from '../../api/courses';
import type { Screen } from '../../navigation/screens';
import { courseProgress } from './courseMeta';

interface Props {
  item: CourseListItem;
  onOpenCourse: (courseId: string) => void;
  /** Goes to a screen; the course is remembered as the one being studied. */
  onNavigate: (screen: Screen, courseId: string) => void;
}

/** The lit card on top of «Mine» (Courses spec §5.2, block 1). */
export function NowStudyingCard({ item, onOpenCourse, onNavigate }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const courseId = item.container.id;
  const home = useCourseHome(courseId).data;
  const next = useNextInCourse(home?.units ?? null);
  const progress = courseProgress(home);

  const sorted = [...(home?.units ?? [])].sort((a, b) => a.position - b.position);
  const unitIndex = sorted.findIndex(u => u.id === next.unitId);
  const unit = unitIndex === -1 ? undefined : sorted[unitIndex];
  const done = !!home && next.unitId === null;

  const where = unit
    ? [
        t('coursesTab.unitN', { n: unitIndex + 1, title: unit.title }),
        next.title ? t('coursesTab.next', { title: next.title }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : done
    ? t('coursesTab.courseDone')
    : '';

  // Straight into the material — past the course home and the unit (Courses spec §4.2).
  const target: Screen | null =
    next.unitId && next.item && next.contents
      ? openContentItem(next.item, next.contents, { unitId: next.unitId, courseId })
      : null;
  const onContinue = () => {
    if (done || !next.unitId) return onOpenCourse(courseId);
    onNavigate(target ?? { name: 'UnitContents', unitId: next.unitId, courseId }, courseId);
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpenCourse(courseId)}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card variant="lit" padding={18} style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text style={[typography.overline, { color: colors.accent300 }]}>{t('coursesTab.nowStudying')}</Text>
          {item.enrollment.schoolId !== null && (home?.courseInfo.groupName || home?.courseInfo.schoolName) ? (
            <View style={{ flexShrink: 1 }}>
              <Tag
                variant="accent"
                label={t('coursesTab.schoolTag', {
                  name: home.courseInfo.groupName ?? home.courseInfo.schoolName ?? '',
                })}
              />
            </View>
          ) : null}
        </View>
        <View style={{ gap: 4 }}>
          <Text style={[typography.resumeTitle, { color: colors.text }]}>{item.container.title}</Text>
          {where ? (
            <Text style={[typography.secondary, { color: colors.neutral400 }]} numberOfLines={2}>
              {where}
            </Text>
          ) : null}
        </View>
        {progress && (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[typography.meta, { color: colors.neutral400 }]}>
                {t('coursesTab.unitsDone', { done: progress.unitsDone, total: progress.unitsTotal })}
              </Text>
              <Text style={[typography.meta, { color: colors.neutral400 }]}>{progress.pct}%</Text>
            </View>
            <ProgressTrack value={progress.pct / 100} />
          </View>
        )}
        <Button
          block
          icon={done ? undefined : 'Play'}
          variant={done ? 'secondary' : 'primary'}
          label={done ? t('coursesTab.repeatMaterial') : t('coursesTab.continue')}
          onPress={onContinue}
        />
      </Card>
    </Pressable>
  );
}
