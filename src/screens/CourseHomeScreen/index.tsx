import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useCourseHome } from '../../hooks/useCourseHome';
import { UnitRow } from './UnitRow';
import type { UnitSummary } from '../../api/types';

interface CourseHomeScreenProps {
  courseId: string;
  onBack: () => void;
}

export function CourseHomeScreen({ courseId, onBack }: CourseHomeScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, data, error, refreshing, refresh } = useCourseHome(courseId);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {data?.courseInfo.title ?? t('courses.title')}
          </Text>
          {data && (
            <Text style={styles.headerSub}>
              {data.courseInfo.cefrLevel} · {data.courseInfo.targetLanguage.toUpperCase()} ·{' '}
              {Math.round(data.progress.percentComplete)}%
            </Text>
          )}
        </View>
      </View>

      {status === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('courseHome.loadError')}</Text>
          <Text style={styles.emptyDesc}>{error?.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'loaded' && data && data.units.length === 0 && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('courseHome.noUnits')}</Text>
        </View>
      )}

      {status === 'loaded' && data && data.units.length > 0 && (
        <FlatList
          data={data.units}
          keyExtractor={(unit: UnitSummary) => unit.id}
          renderItem={({ item }) => <UnitRow unit={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
          }
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
    headerInfo: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    headerSub: {
      fontSize: 13,
      color: colors.textMuted,
      marginTop: 2,
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
    list: {
      paddingTop: 12,
      paddingBottom: 24,
    },
  });
