import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Icon, Tag } from '../../../components/ui';
import { useMasteryProfile } from '../../../hooks/useMasteryProfile';
import { useTranslation } from '../../../i18n';
import { splitVerdicts } from '../../../lib/splitVerdicts';
import { useTheme } from '../../../providers/ThemeProvider';
import { workOnThisTopics } from '../blockLogic';
import { useRegisterRefresh } from '../refresh';

interface WorkOnThisProps {
  /** Practice; its mixed mode arrives with plan 05, until then the tab's root. */
  onOpenPractice: () => void;
}

/**
 * Block 11 (the web's `WorkOnThis`): up to three weak topics, never a number — a percentage
 * is a grade. Not rendered when the profile cannot be read, says nothing is weak, or names
 * nothing it knows.
 */
export function WorkOnThis({ onOpenPractice }: WorkOnThisProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const { profile, refresh } = useMasteryProfile();
  useRegisterRefresh(refresh);
  if (!profile) return null;

  const topics = workOnThisTopics(splitVerdicts(profile.weakest).weak, t);
  if (topics.length === 0) return null;

  return (
    <Card variant="outline" style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="Compass" size={18} color={colors.neutral400} />
        <Text style={[typography.cardTitle, { color: colors.text }]}>{t('today.workOnThis.title')}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {topics.map((topic) => (
          <Tag key={topic} label={topic} variant="neutral" />
        ))}
      </View>
      <Text style={[typography.secondary, { color: colors.neutral400 }]}>{t('today.workOnThis.body')}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onOpenPractice}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={[typography.secondary, { color: colors.accent300 }]}>
          {`${t('today.workOnThis.cta')} →`}
        </Text>
      </Pressable>
    </Card>
  );
}
