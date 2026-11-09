import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Overline } from '../../../../components/ui';
import {
  DeepPhase,
  PHASE_ORDER,
  getNextPhase,
} from '../../../../hooks/useDeepSession';
import { useTranslation } from '../../../../i18n';
import { useTheme } from '../../../../providers/ThemeProvider';

const PHASE_KEY: Record<DeepPhase, string> = {
  flashcard: 'review.phasePreview',
  listening: 'review.phaseListening',
  quiz: 'review.phaseQuiz',
  spelling: 'review.phaseSpelling',
  complete: 'results.done',
};

interface PhaseTransitionScreenProps {
  lastPhase: DeepPhase;
  lastPhaseCorrect: number;
  totalWords: number;
}

/**
 * The 1.2 s pause between phases (Practice §8.3): which phase comes next and how the one
 * just finished went. No emoji, no spinner — it moves on by itself.
 */
export function PhaseTransitionScreen({
  lastPhase,
  lastPhaseCorrect,
  totalWords,
}: PhaseTransitionScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const next = getNextPhase(lastPhase);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'bottom']}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 }}
      >
        <Overline>
          {t('reviewSession.phaseOf', {
            i: PHASE_ORDER.indexOf(next) + 1,
            n: PHASE_ORDER.length,
          })}
        </Overline>
        <Text style={{ fontSize: 22, fontWeight: '500', color: colors.text }}>
          {t(PHASE_KEY[next])}
        </Text>
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {t('reviewSession.phaseCorrect', { correct: lastPhaseCorrect, total: totalWords })}
        </Text>
      </View>
    </SafeAreaView>
  );
}
