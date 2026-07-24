import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { useMyCourses } from '../../hooks/useMyCourses';
import { LoginForm } from './LoginForm';
import { CourseCard } from './CourseCard';
import { CourseListItem } from '../../api/courses';

interface CoursesScreenProps {
  onCoursePress: (courseId: string) => void;
}

export function CoursesScreen({ onCoursePress }: CoursesScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status } = useAuth();
  const { status: coursesStatus, courses, error, refreshing, refresh } = useMyCourses();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('courses.title')}</Text>
      </View>

      {status === 'restoring' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {status === 'signedOut' && <LoginForm />}

      {status === 'signedIn' && coursesStatus === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {status === 'signedIn' && coursesStatus === 'error' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('courses.loadError')}</Text>
          <Text style={styles.emptyDesc}>{error?.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'signedIn' && coursesStatus === 'loaded' && courses.length === 0 && (
        <FlatList
          data={[]}
          renderItem={null}
          contentContainerStyle={styles.centerFill}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <>
              <Text style={styles.emptyTitle}>{t('courses.noCoursesYet')}</Text>
              <Text style={styles.emptyDesc}>{t('courses.noCoursesYetDesc')}</Text>
            </>
          }
        />
      )}

      {status === 'signedIn' && coursesStatus === 'loaded' && courses.length > 0 && (
        <FlatList
          data={courses}
          keyExtractor={(item: CourseListItem) => item.enrollment.id}
          renderItem={({ item }) => (
            <CourseCard item={item} onPress={() => onCoursePress(item.container.id)} />
          )}
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
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
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
    list: {
      paddingTop: 4,
      paddingBottom: 24,
    },
  });
