import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import { Icon, ProgressTrack, PressableScale, Spinner } from '../../components/ui';
import { useCourseHome } from '../../hooks/useCourseHome';
import type { CourseListItem } from '../../api/courses';
import { courseProgress, isSelfStudy } from './courseMeta';

export type CourseDownloadIcon = 'done' | 'none' | 'downloading';

interface Props {
  item: CourseListItem;
  download: CourseDownloadIcon;
  onPress: () => void;
}

/** A course other than the one being studied (Courses spec §5.2, block 2). */
export function MoreCourseRow({ item, download, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const home = useCourseHome(item.container.id).data;
  const progress = courseProgress(home);

  const where = isSelfStudy(item)
    ? t('coursesTab.selfStudy')
    : home?.courseInfo.schoolName ?? t('coursesTab.school');
  const meta = [item.container.difficultyLevel, where].join(' · ');
  const started = !!progress && (progress.pct > 0 || progress.unitsDone > 0);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.container.title}. ${meta}`}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={2}>
            {item.container.title}
          </Text>
          <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {download === 'downloading' ? (
          <Spinner size={18} color={colors.neutral400} />
        ) : (
          <Icon
            name={download === 'done' ? 'DeviceMobile' : 'CloudArrowDown'}
            size={18}
            color={colors.neutral400}
          />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <ProgressTrack value={(progress?.pct ?? 0) / 100} fill={colors.accent600} />
        </View>
        <Text style={[typography.meta, { color: colors.neutral400 }]}>
          {progress && started
            ? t('coursesTab.unitsDone', { done: progress.unitsDone, total: progress.unitsTotal })
            : t('coursesTab.notStarted')}
        </Text>
      </View>
    </PressableScale>
  );
}
