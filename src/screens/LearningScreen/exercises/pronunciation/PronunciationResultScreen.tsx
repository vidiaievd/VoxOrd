import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatStrip } from '../../../../components/practice';
import { Button } from '../../../../components/ui';
import { useTranslation } from '../../../../i18n';
import { useTheme } from '../../../../providers/ThemeProvider';
import { resultTitleKey } from '../../SessionResultsScreen';

interface PronunciationResultScreenProps {
  correctCount: number;
  totalItems: number;
  onContinue: () => void;
}

/** The result of a pronunciation run (Practice §8.3, same shape as 7.5): no emoji, no XP. */
export function PronunciationResultScreen({
  correctCount,
  totalItems,
  onContinue,
}: PronunciationResultScreenProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const accuracy = totalItems > 0 ? correctCount / totalItems : 0;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'bottom']}
    >
      <View style={{ flex: 1, paddingTop: 28, paddingHorizontal: 20, gap: 18 }}>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 26, lineHeight: 30, fontWeight: '500', color: colors.text }}
        >
          {t(resultTitleKey(accuracy))}
        </Text>
        <StatStrip
          items={[
            {
              value: `${Math.round(accuracy * 100)}%`,
              label: t('results.accuracy'),
              accent: true,
            },
            { value: `${correctCount}/${totalItems}`, label: t('results.correct') },
          ]}
        />
      </View>
      <View style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Button block label={t('results.done')} onPress={onContinue} />
      </View>
    </SafeAreaView>
  );
}
