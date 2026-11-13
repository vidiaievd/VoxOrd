import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Melody } from '../../api/soundSession';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { CHART_H, CHART_W, melodyPaths } from './melodyPaths';

/**
 * The learner's pitch against the model's (platform plan 86, VoxOrd step 15.4): two lines on one
 * scale, the model dashed so the difference does not rest on colour.
 */
export function MelodyChart({ melody }: { melody: Melody }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const paths = melodyPaths(melody);
  if (paths === null) {
    return (
      <Text style={[typography.meta, { color: colors.neutral500 }]}>
        {t('soundSession.melody.none')}
      </Text>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      <Svg
        accessibilityRole="image"
        accessibilityLabel={t('soundSession.melody.label')}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        height={CHART_H}
      >
        {paths.model.map((d, i) => (
          <Path
            key={`m${i}`}
            d={d}
            fill="none"
            stroke={colors.neutral500}
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        ))}
        {paths.yours.map((d, i) => (
          <Path
            key={`y${i}`}
            d={d}
            fill="none"
            stroke={colors.accentBase}
            strokeWidth={3}
            strokeLinecap="round"
          />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          — {t('soundSession.melody.yours')}
        </Text>
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          - - {t('soundSession.melody.model')}
        </Text>
      </View>
    </View>
  );
}
