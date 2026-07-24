import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useLessonReader } from '../../hooks/useLessonReader';

interface LessonReaderScreenProps {
  lessonId: string;
  courseId: string;
  onBack: () => void;
}

export function LessonReaderScreen({ lessonId, courseId, onBack }: LessonReaderScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, data, error, refresh } = useLessonReader(lessonId, courseId);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {data?.displayTitle ?? data?.title ?? t('lessonReader.title')}
        </Text>
      </View>

      {status === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('lessonReader.loadError')}</Text>
          <Text style={styles.emptyDesc}>{error?.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'loaded' && data && data.kind !== 'text' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('lessonReader.unsupportedKind')}</Text>
        </View>
      )}

      {status === 'loaded' && data && data.kind === 'text' && (
        <ScrollView contentContainerStyle={styles.scroll}>
          {(data.paragraphs ?? []).map((paragraph, i) => (
            <View key={i} style={styles.paragraphBlock}>
              <Text style={styles.paragraphTarget}>{paragraph.target}</Text>
            </View>
          ))}
          {(data.paragraphs ?? []).length === 0 && (
            <Text style={styles.emptyDesc}>{t('lessonReader.noContent')}</Text>
          )}
        </ScrollView>
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
    scroll: {
      padding: 20,
    },
    paragraphBlock: {
      marginBottom: 16,
    },
    paragraphTarget: {
      fontSize: 17,
      lineHeight: 26,
      color: colors.textPrimary,
    },
  });
