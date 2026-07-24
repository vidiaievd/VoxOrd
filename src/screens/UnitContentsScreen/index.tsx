import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SectionList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useUnitContents } from '../../hooks/useUnitContents';
import { ContentItemRow } from './ContentItemRow';
import type { UnitContentsItem } from '../../api/types';

interface UnitContentsScreenProps {
  unitId: string;
  onBack: () => void;
  onLessonPress: (lessonId: string) => void;
  /**
   * Launch the exercise runner over the unit's exercises as a set, starting
   * at the tapped one. `exerciseIds` are content ids in display order.
   */
  onExercisePress: (exerciseIds: string[], startIndex: number) => void;
}

interface Section {
  key: string;
  title: string;
  data: UnitContentsItem[];
}

export function UnitContentsScreen({
  unitId,
  onBack,
  onLessonPress,
  onExercisePress,
}: UnitContentsScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, data, error, refreshing, refresh } = useUnitContents(unitId);

  const sections: Section[] = data
    ? [
        ...data.sections.map((s) => ({ key: s.id, title: s.title, data: s.items })),
        ...(data.ungroupedItems.length > 0
          ? [{ key: 'ungrouped', title: t('unitContents.otherItems'), data: data.ungroupedItems }]
          : []),
      ]
    : [];
  const isEmpty = sections.every((s) => s.data.length === 0);

  // The unit's exercises in display order, treated as one runnable set.
  const exerciseIds = sections
    .flatMap((s) => s.data)
    .filter((i) => i.contentType === 'exercise')
    .map((i) => i.contentId);

  const handleItemPress = (item: UnitContentsItem): (() => void) | undefined => {
    if (item.contentType === 'lesson') {
      return () => onLessonPress(item.contentId);
    }
    if (item.contentType === 'exercise') {
      const startIndex = exerciseIds.indexOf(item.contentId);
      return () => onExercisePress(exerciseIds, Math.max(0, startIndex));
    }
    return undefined;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {data?.moduleTitle ?? t('unitContents.title')}
        </Text>
      </View>

      {status === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('unitContents.loadError')}</Text>
          <Text style={styles.emptyDesc}>{error?.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'loaded' && isEmpty && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('unitContents.noItems')}</Text>
        </View>
      )}

      {status === 'loaded' && !isEmpty && (
        <SectionList
          sections={sections}
          keyExtractor={(item: UnitContentsItem) => item.id}
          renderItem={({ item }) => (
            <ContentItemRow item={item} onPress={handleItemPress(item)} />
          )}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            ) : null
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
          }
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      padding: 8,
      marginRight: 8,
    },
    backText: {
      fontSize: 22,
      color: colors.textPrimary,
    },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    centerFill: {
      flex: 1,
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptyDesc: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textInverted,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 6,
    },
    list: {
      paddingTop: 8,
      paddingBottom: 24,
    },
  });
