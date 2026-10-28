import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import type { CourseReviewPhase } from '../../lib/courseReviewSet';

const PHASE_KEY: Record<CourseReviewPhase, string> = {
  preview: 'review.phasePreview',
  listening: 'review.phaseListening',
  quiz: 'review.phaseQuiz',
  spelling: 'review.phaseSpelling',
};

export interface PhaseTrackerProps {
  /** The phases this session actually plans, in order — a small deck runs fewer than four. */
  phases: readonly CourseReviewPhase[];
  /** Index of the current phase in `phases`. */
  index: number;
}

/**
 * One segment per planned phase (Practice §5.2): done in `accent600`, current in `accent`,
 * ahead in `neutral800`, each with its name below. A session of one phase draws nothing —
 * there is nothing to track.
 */
export function PhaseTracker({ phases, index }: PhaseTrackerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (phases.length <= 1) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 4,
        paddingTop: 2,
        paddingHorizontal: 20,
        paddingBottom: 14,
      }}
    >
      {phases.map((phase, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'ahead';
        const label = t(PHASE_KEY[phase]);
        return (
          <View
            key={`${phase}-${i}`}
            accessible
            accessibilityLabel={`${t('reviewSession.phaseOf', {
              i: i + 1,
              n: phases.length,
            })}: ${label}`}
            style={{ flex: 1, gap: 6 }}
          >
            <View
              style={{
                height: 3,
                borderRadius: 2,
                backgroundColor:
                  state === 'done'
                    ? colors.accent600
                    : state === 'current'
                      ? colors.accentBase
                      : colors.neutral800,
              }}
            />
            <Text
              numberOfLines={1}
              style={{
                fontSize: 10.5,
                color:
                  state === 'current'
                    ? colors.accent200
                    : state === 'done'
                      ? colors.neutral400
                      : colors.neutral600,
              }}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
