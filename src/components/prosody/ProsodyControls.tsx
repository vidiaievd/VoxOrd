import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '../../i18n';
import { PROSODY_LENSES } from '../../lib/prosody/marks';
import { useTheme } from '../../providers/ThemeProvider';
import type { ProsodyLens, ProsodyMode } from '../../store/settingsStore';
import { radii } from '../../theme/spacing';
import { typography } from '../../theme/typography';

export interface ProsodyControlsProps {
  mode: ProsodyMode;
  lens: ProsodyLens;
  legend: boolean;
  onChange: (next: { mode: ProsodyMode; lens: ProsodyLens; legend: boolean }) => void;
  /** Whether melody is offered: only a text with phrase marks has one. */
  melody?: boolean;
  /** Whether «By sentence» is offered: a reading the learner can say one sentence of and have it heard. */
  sentences?: boolean;
}

const LENS_LABEL: Record<ProsodyLens, 'prosody.lensStress' | 'prosody.lensSounds' | 'prosody.lensRespell' | 'prosody.lensMelody'> = {
  stress: 'prosody.lensStress',
  sounds: 'prosody.lensSounds',
  respell: 'prosody.lensRespell',
  melody: 'prosody.lensMelody',
};

/**
 * What to show under a text: «Meaning» (nothing) or one lens of the pronunciation, and
 * whether its legend is on (plan 86, §4i.2). One lens at a time — their sum is not readable.
 */
export function ProsodyControls({
  mode,
  lens,
  legend,
  onChange,
  melody = true,
  sentences = false,
}: ProsodyControlsProps) {
  const { t } = useTranslation();
  const lenses = PROSODY_LENSES.filter((l) => l !== 'melody' || melody || lens === 'melody');
  const drawn = mode !== 'meaning';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={t('prosody.lensGroup')}
      contentContainerStyle={styles.row}
    >
      <Chip
        label={t('prosody.modeMeaning')}
        selected={!drawn}
        onPress={() => onChange({ mode: 'meaning', lens, legend })}
      />
      {lenses.map((l) => (
        <Chip
          key={l}
          label={t(LENS_LABEL[l])}
          selected={drawn && lens === l}
          onPress={() => onChange({ mode: mode === 'sentences' ? mode : 'text', lens: l, legend })}
        />
      ))}
      {sentences && (
        <Chip
          label={t('prosody.modeSentences')}
          selected={mode === 'sentences'}
          onPress={() => onChange({ mode: 'sentences', lens, legend })}
        />
      )}
      {drawn && (
        <Chip
          label={t('prosody.legendShow')}
          selected={legend}
          toggle
          onPress={() => onChange({ mode, lens, legend: !legend })}
        />
      )}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
  toggle = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  toggle?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={toggle ? 'switch' : 'button'}
      accessibilityState={toggle ? { checked: selected } : { selected }}
      onPress={onPress}
      hitSlop={4}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.accent800 : colors.neutral900 },
      ]}
    >
      <View>
        <Text
          numberOfLines={1}
          style={[typography.secondary, { color: selected ? colors.text : colors.neutral400 }]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: radii.plate,
    justifyContent: 'center',
  },
});
