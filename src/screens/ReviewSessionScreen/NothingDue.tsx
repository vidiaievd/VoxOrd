import React from 'react';
import { Text } from 'react-native';
import { Button } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import type { CourseReviewOverview } from '../../lib/courseReviewLoader';
import { ImportUnresolvedList } from './ImportUnresolvedList';
import { MessageLayout } from './MessageLayout';

interface NothingDueProps {
  overview: CourseReviewOverview | null;
  onImported: () => void;
  onBack: () => void;
}

/**
 * «Nothing to review» (Practice §7.6, 6j). Two situations land here and the copy tells them
 * apart: nothing is due; or something is due but its list was never imported — then each such
 * list gets a row that saves it. The forecast line waits for a forecast endpoint.
 */
export function NothingDue({ overview, onImported, onBack }: NothingDueProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const unresolved = overview?.unresolvedCardIds.length ?? 0;
  const listIds = overview?.unresolvedListIds ?? [];

  return (
    <MessageLayout
      icon="CheckCircle"
      title={t('review.nothingDue')}
      footer={<Button block variant="ghost" label={t('common.back')} onPress={onBack} />}
    >
      {unresolved > 0 ? (
        <Text style={[typography.body, { color: colors.neutral400 }]}>
          {t('review.notImported', { count: unresolved })}
        </Text>
      ) : null}
      {listIds.map(listId => (
        <ImportUnresolvedList
          key={listId}
          listId={listId}
          waiting={overview?.unresolvedCountByList[listId] ?? 0}
          onImported={onImported}
        />
      ))}
    </MessageLayout>
  );
}
