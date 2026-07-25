import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { ColorScheme } from '../../../theme/colors';
import type { AudioLessonStage } from './listeningStages';

interface StageTrackerProps {
  stage: AudioLessonStage;
  hasGapFill: boolean;
  hasComprehension: boolean;
}

interface TrackerStep {
  id: Exclude<AudioLessonStage, 'done'>;
  labelKey: 'audioLesson.stageListen' | 'audioLesson.stageGapFill' | 'audioLesson.stageComprehension';
}

/** Only shows steps that actually exist for this lesson (mirrors the web tracker, minus the always-3-dots assumption). */
export function StageTracker({ stage, hasGapFill, hasComprehension }: StageTrackerProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const steps: TrackerStep[] = [
    { id: 'listen', labelKey: 'audioLesson.stageListen' },
    ...(hasGapFill ? [{ id: 'gapfill' as const, labelKey: 'audioLesson.stageGapFill' as const }] : []),
    ...(hasComprehension
      ? [{ id: 'comprehension' as const, labelKey: 'audioLesson.stageComprehension' as const }]
      : []),
  ];
  const activeIndex = steps.findIndex((s) => s.id === stage);
  const effectiveActiveIndex = stage === 'done' ? steps.length : activeIndex;

  return (
    <View style={styles.row}>
      {steps.map((s, i) => {
        const done = i < effectiveActiveIndex;
        const active = i === effectiveActiveIndex;
        return (
          <React.Fragment key={s.id}>
            {i > 0 && (
              <View style={[styles.connector, (done || active) && styles.connectorActive]} />
            )}
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                active && styles.dotActive,
                !done && !active && styles.dotPending,
              ]}
            >
              <Text style={[styles.dotText, done && styles.dotTextDone, active && styles.dotTextActive]}>
                {done ? '✓' : i + 1}
              </Text>
            </View>
            <Text style={[styles.label, (done || active) && styles.labelActive]}>{t(s.labelKey)}</Text>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    connector: {
      width: 16,
      height: 2,
      backgroundColor: colors.border,
      marginHorizontal: 4,
    },
    connectorActive: {
      backgroundColor: colors.accent,
    },
    dot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
    },
    dotPending: {
      backgroundColor: colors.border,
    },
    dotDone: {
      backgroundColor: colors.accent,
    },
    dotActive: {
      backgroundColor: colors.accentLight,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    dotText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    dotTextDone: {
      color: colors.textInverted,
    },
    dotTextActive: {
      color: colors.accent,
    },
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginRight: 10,
    },
    labelActive: {
      color: colors.textPrimary,
    },
  });
