import React from 'react';
import { Text } from 'react-native';
import { Button, Card } from '../../../components/ui';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';

interface FirstRunProps {
  /** A learner in a school waits to be enrolled; one without is sent to the catalogue. */
  inSchool: boolean;
  offline: boolean;
  /** The Courses tab for a school's learner, the catalogue for one without. */
  onOpenCourses: () => void;
}

/** Block F: no courses yet — replaces the blocks that would have nothing to show. */
export function FirstRun({ inSchool, offline, onOpenCourses }: FirstRunProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  return (
    <Card style={{ gap: 12 }}>
      <Text style={[typography.cardTitleMedium, { color: colors.text }]}>
        {t('today.first.title')}
      </Text>
      <Text style={[typography.body, { color: colors.neutral400 }]}>
        {inSchool ? t('today.first.bodySchool') : t('today.first.bodyCatalogue')}
      </Text>
      <Button label={inSchool ? t('today.first.cta') : t('coursesTab.openCatalog')} onPress={onOpenCourses} />
      {offline ? null : (
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          {t('today.first.offlineHint')}
        </Text>
      )}
    </Card>
  );
}
