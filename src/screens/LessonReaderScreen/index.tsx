import React, { useMemo } from 'react';
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
import { useMarkLessonRead } from '../../hooks/useMarkLessonRead';
import { buildGlossaryIndex } from '../../utils/tokenizeGlossary';
import { ParagraphView } from './ParagraphView';

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
  const { status: markStatus, error: markError, markAsRead } = useMarkLessonRead(lessonId);
  const glossaryIndex = useMemo(
    () => buildGlossaryIndex(data?.glossary ?? []),
    [data?.glossary],
  );

  const handleMarkAsRead = async () => {
    const ok = await markAsRead();
    if (ok) onBack();
  };

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
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            {(data.paragraphs ?? []).map((paragraph, i) => (
              <ParagraphView key={i} paragraph={paragraph} glossaryIndex={glossaryIndex} />
            ))}
            {(data.paragraphs ?? []).length === 0 && (
              <Text style={styles.emptyDesc}>{t('lessonReader.noContent')}</Text>
            )}
          </ScrollView>
          <View style={styles.footer}>
            {markStatus === 'error' && (
              <Text style={styles.footerError}>{markError?.message}</Text>
            )}
            <TouchableOpacity
              style={styles.markReadBtn}
              onPress={handleMarkAsRead}
              disabled={markStatus === 'submitting'}
            >
              {markStatus === 'submitting' ? (
                <ActivityIndicator size="small" color={colors.textInverted} />
              ) : (
                <Text style={styles.markReadText}>{t('lessonReader.markAsRead')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
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
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerError: {
      fontSize: 13,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: 8,
    },
    markReadBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    markReadText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
  });
