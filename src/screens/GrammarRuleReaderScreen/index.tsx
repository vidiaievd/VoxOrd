import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useGrammarRuleReader } from '../../hooks/useGrammarRuleReader';
import { getGrammarRulePoolExerciseIds } from '../../api/grammarRules';

interface GrammarRuleReaderScreenProps {
  ruleId: string;
  courseId: string;
  onBack: () => void;
  /** Launches the exercise runner over this rule's practice pool. */
  onPracticePress: (exerciseIds: string[]) => void;
}

export function GrammarRuleReaderScreen({
  ruleId,
  courseId,
  onBack,
  onPracticePress,
}: GrammarRuleReaderScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status, data, error, refresh } = useGrammarRuleReader(ruleId, courseId);
  const markdownStyle = useMemo(() => makeMarkdownStyle(colors), [colors]);
  const [practiceStatus, setPracticeStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>(
    'idle',
  );

  const handlePractice = async () => {
    setPracticeStatus('loading');
    try {
      const exerciseIds = await getGrammarRulePoolExerciseIds(ruleId);
      if (exerciseIds.length === 0) {
        setPracticeStatus('empty');
        return;
      }
      setPracticeStatus('idle');
      onPracticePress(exerciseIds);
    } catch {
      setPracticeStatus('error');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {data?.displayTitle ?? t('grammarRuleReader.title')}
        </Text>
      </View>

      {status === 'loading' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('grammarRuleReader.loadError')}</Text>
          <Text style={styles.emptyDesc}>{error?.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refresh}>
            <Text style={styles.retryButtonText}>{t('courses.retry')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'loaded' && data && (
        <>
          <ScrollView contentContainerStyle={styles.scroll}>
            {data.displaySummary ? <Text style={styles.summary}>{data.displaySummary}</Text> : null}
            {data.bodyMarkdown ? (
              <Markdown style={markdownStyle}>{data.bodyMarkdown}</Markdown>
            ) : (
              <Text style={styles.emptyDesc}>{t('grammarRuleReader.noContent')}</Text>
            )}
          </ScrollView>
          <View style={styles.footer}>
            {practiceStatus === 'empty' ? (
              <Text style={styles.footerError}>{t('grammarRuleReader.noPracticeExercises')}</Text>
            ) : null}
            {practiceStatus === 'error' ? (
              <Text style={styles.footerError}>{t('grammarRuleReader.practiceLoadError')}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.practiceBtn}
              onPress={handlePractice}
              disabled={practiceStatus === 'loading'}
            >
              {practiceStatus === 'loading' ? (
                <ActivityIndicator size="small" color={colors.textInverted} />
              ) : (
                <Text style={styles.practiceBtnText}>{t('grammarRuleReader.goToPractice')}</Text>
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
    summary: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 21,
      marginBottom: 16,
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
    practiceBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    practiceBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textInverted,
    },
  });

const makeMarkdownStyle = (colors: ColorScheme) => ({
  body: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  heading1: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    marginTop: 4,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.textPrimary,
    marginTop: 12,
    marginBottom: 4,
  },
  strong: {
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  code_inline: {
    backgroundColor: colors.backgroundCard,
    color: colors.textPrimary,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  // The seed content's example boxes are markdown blockquotes (`>`), which
  // hit this style, not code_block/fence — confirmed on-device (the example
  // box, not a fenced fence-flavored block). Library default hardcodes a
  // light #F5F5F5 background with no text color override (styles.js), so
  // dark-theme body text renders near-white on near-white — illegible.
  blockquote: {
    backgroundColor: colors.backgroundCard,
    borderColor: colors.accent,
    borderLeftWidth: 4,
    marginLeft: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  // Library defaults hardcode a light #f5f5f5 background (styles.js) with no
  // text color override, so on the dark theme body text renders near-white
  // on near-white — illegible. Overridden here rather than left to inherit,
  // in case a rule's markdown ever does use a real fenced code block.
  code_block: {
    backgroundColor: colors.backgroundCard,
    borderColor: colors.border,
    color: colors.textPrimary,
    borderRadius: 8,
    padding: 10,
  },
  fence: {
    backgroundColor: colors.backgroundCard,
    borderColor: colors.border,
    color: colors.textPrimary,
    borderRadius: 8,
    padding: 10,
  },
  // Library defaults hardcode black (#000000) borders (styles.js) — barely
  // visible against a dark background.
  table: {
    borderColor: colors.border,
    borderRadius: 6,
  },
  tr: {
    borderColor: colors.border,
  },
});
