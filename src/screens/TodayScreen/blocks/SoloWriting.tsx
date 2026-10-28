import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, Icon } from '../../../components/ui';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { dismissSoloWriting, isSoloWritingDismissed } from '../../../store/soloWritingNoticeStore';

interface SoloWritingProps {
  /** Until plan 07 adds the subscription screen: Profile. */
  onConnectAi: () => void;
  /** The catalogue segment of Courses (it has no school filter — the web's school search is not ported). */
  onFindSchool: () => void;
}

/**
 * Block 10 (variant B): without a teacher, writing and speaking are checked against a sample
 * answer. The spec shows it only when the learner's courses hold such tasks; the phone's course
 * list carries no exercise templates, so a solo learner with AI review off sees it until they
 * close it.
 */
export function SoloWriting({ onConnectAi, onFindSchool }: SoloWritingProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    isSoloWritingDismissed().then((d) => live && setDismissed(d));
    return () => {
      live = false;
    };
  }, []);

  // Until the choice is read, say nothing rather than flash a notice that is about to go.
  if (dismissed !== false) return null;

  const link = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center' }}
    >
      <Text style={[typography.secondary, { color: colors.accent300 }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Card variant="outline" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="NotePencil" size={18} color={colors.neutral400} />
        <Text style={[typography.cardTitle, { color: colors.text, flex: 1 }]}>
          {t('today.soloWriting.title')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.dismiss')}
          onPress={() => {
            void dismissSoloWriting();
            setDismissed(true);
          }}
          hitSlop={6}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', margin: -10 }}
        >
          <Icon name="XCircle" size={18} color={colors.neutral500} />
        </Pressable>
      </View>
      <Text style={[typography.secondary, { color: colors.neutral400 }]}>
        {t('today.soloWriting.body')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 }}>
        {link(t('today.soloWriting.connectAi'), onConnectAi)}
        {link(t('today.soloWriting.findSchool'), onFindSchool)}
      </View>
    </Card>
  );
}
