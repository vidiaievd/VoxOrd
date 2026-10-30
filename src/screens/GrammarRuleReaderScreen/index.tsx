import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { Typography } from '../../theme/typography';
import { radii } from '../../theme/spacing';
import { useGrammarRuleReader } from '../../hooks/useGrammarRuleReader';
import { useUnitContents } from '../../hooks/useUnitContents';
import { useUnitNumber } from '../../hooks/useUnitNumber';
import { getGrammarRulePoolExerciseIds } from '../../api/grammarRules';
import { Button, NavHeader, Spinner } from '../../components/ui';

interface GrammarRuleReaderScreenProps {
  ruleId: string;
  courseId: string;
  /** The unit the rule belongs to — its number is the header's parent label. */
  unitId: string;
  onBack: () => void;
  /** Launches the exercise runner over this rule's practice pool. */
  onPracticePress: (exerciseIds: string[]) => void;
}

export function GrammarRuleReaderScreen({
  ruleId,
  courseId,
  unitId,
  onBack,
  onPracticePress,
}: GrammarRuleReaderScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const unitNumber = useUnitNumber(courseId, unitId);
  const { status, data, error, refresh } = useGrammarRuleReader(ruleId, courseId);
  const markdownStyle = useMemo(() => makeMarkdownStyle(colors, typography), [colors, typography]);
  const [practiceStatus, setPracticeStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>(
    'idle',
  );
  // The practice pool, asked for on open so the button can say how many exercises wait. Until
  // it is known — or when it could not be fetched — the button says nothing of a number and a
  // press asks again.
  const [pool, setPool] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGrammarRulePoolExerciseIds(ruleId)
      .then(ids => !cancelled && setPool(ids))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ruleId]);

  // The rule's mastery is on its row in the unit; the cached unit gives it without a request.
  const mastery = useUnitContents(unitId).data?.sections
    .flatMap(section => section.items)
    .find(item => item.contentType === 'grammar_rule' && item.contentId === ruleId)
    ?.masteryPercent;

  const handlePractice = async () => {
    setPracticeStatus('loading');
    try {
      const exerciseIds = pool ?? (await getGrammarRulePoolExerciseIds(ruleId));
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

  const centered = { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 } as const;
  const note = { ...typography.secondary, color: colors.neutral400, textAlign: 'center' } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <NavHeader
        parentLabel={unitNumber ? t('lessonReader.back', { n: unitNumber }) : t('grammarRuleReader.title')}
        onBack={onBack}
      />

      {status === 'loading' && (
        <View style={centered}>
          <Spinner size={24} color={colors.neutral400} />
        </View>
      )}

      {status === 'error' && (
        <View style={centered}>
          <Text style={[typography.cardTitleMedium, { color: colors.text, textAlign: 'center' }]}>
            {t('grammarRuleReader.loadError')}
          </Text>
          <Text style={[typography.body, { color: colors.neutral400, textAlign: 'center' }]}>
            {error?.message}
          </Text>
          <Button variant="secondary" size={44} label={t('courses.retry')} onPress={refresh} />
        </View>
      )}

      {status === 'loaded' && data && (
        <>
          <ScrollView
            contentContainerStyle={{ paddingTop: 4, paddingHorizontal: 20, paddingBottom: 24, gap: 14 }}
          >
            <Text style={[typography.meta, { color: colors.neutral500 }]}>
              {typeof mastery === 'number'
                ? t('grammarRuleReader.meta', { pct: mastery })
                : t('grammarRuleReader.title')}
            </Text>
            <Text style={{ ...typography.h1, fontSize: 24, lineHeight: 30, letterSpacing: -0.2, color: colors.text }}>
              {data.displayTitle}
            </Text>
            {data.displaySummary ? (
              <Text style={{ ...typography.cardTitle, lineHeight: 23, color: colors.neutral300 }}>
                {data.displaySummary}
              </Text>
            ) : null}
            {data.bodyMarkdown ? (
              <Markdown style={markdownStyle}>{data.bodyMarkdown}</Markdown>
            ) : (
              <Text style={[typography.body, { color: colors.neutral400, textAlign: 'center' }]}>
                {t('grammarRuleReader.noContent')}
              </Text>
            )}
          </ScrollView>
          <View
            style={{
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: 14,
              gap: 8,
              borderTopWidth: 1,
              borderTopColor: colors.neutral800,
            }}
          >
            {practiceStatus === 'empty' ? (
              <Text style={note}>{t('grammarRuleReader.noPracticeExercises')}</Text>
            ) : null}
            {practiceStatus === 'error' ? (
              <Text style={note}>{t('grammarRuleReader.practiceLoadError')}</Text>
            ) : null}
            <Button
              block
              size={48}
              variant="primary"
              label={
                pool && pool.length > 0
                  ? t('grammarRuleReader.goToPracticeN', { count: pool.length })
                  : t('grammarRuleReader.goToPractice')
              }
              disabled={practiceStatus === 'loading'}
              onPress={handlePractice}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

/**
 * Markdown on the Nocturne look (Courses §8.3). The library hard-codes light backgrounds
 * and black borders for blockquotes, code and tables — each is overridden, or the dark theme
 * renders near-white text on near-white. The seed's example boxes are blockquotes (`>`).
 */
const makeMarkdownStyle = (colors: ColorScheme, typography: Typography) => ({
  body: {
    ...typography.cardTitle,
    lineHeight: 23,
    color: colors.neutral200,
  },
  heading1: {
    ...typography.resumeTitle,
    color: colors.text,
    marginTop: 4,
    marginBottom: 8,
  },
  heading2: {
    ...typography.cardTitleMedium,
    fontSize: 18,
    lineHeight: 24,
    color: colors.text,
    marginTop: 16,
    marginBottom: 6,
  },
  heading3: {
    ...typography.cardTitleMedium,
    color: colors.text,
    marginTop: 12,
    marginBottom: 4,
  },
  // The verb in an example stands out by weight and colour, not by a heavier face.
  strong: {
    fontFamily: typography.cardTitleMedium.fontFamily,
    fontWeight: 'normal' as const,
    color: colors.accent300,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  code_inline: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 0,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  // Examples: a plate, no accent bar on the left.
  blockquote: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderLeftWidth: 0,
    borderRadius: radii.plate,
    marginLeft: 0,
    marginVertical: 4,
    padding: 14,
  },
  code_block: {
    backgroundColor: colors.surface,
    borderWidth: 0,
    color: colors.text,
    borderRadius: radii.plate,
    padding: 10,
  },
  fence: {
    backgroundColor: colors.surface,
    borderWidth: 0,
    color: colors.text,
    borderRadius: radii.plate,
    padding: 10,
  },
  // No outer frame and no vertical lines: a hairline above every row.
  table: {
    borderWidth: 0,
    borderRadius: 0,
  },
  tr: {
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderColor: colors.neutral800,
  },
  th: {
    ...typography.meta,
    color: colors.neutral500,
    flex: 1,
    paddingTop: 8,
    paddingRight: 4,
    paddingBottom: 8,
    paddingLeft: 0,
  },
  td: {
    ...typography.meta,
    color: colors.neutral200,
    flex: 1,
    paddingTop: 8,
    paddingRight: 4,
    paddingBottom: 8,
    paddingLeft: 0,
  },
});
