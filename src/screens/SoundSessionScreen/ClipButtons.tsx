import React from 'react';
import { Text, View } from 'react-native';
import type { ReferenceClip } from '../../api/soundSession';
import { Button } from '../../components/ui';
import { useClipPlayer } from '../../hooks/useClipPlayer';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';

/** The model clips of the step's words, one button each; starting one silences the other. */
export function ClipButtons({ clips }: { clips: ReferenceClip[] }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const player = useClipPlayer();

  if (clips.length === 0) {
    return (
      <Text style={[typography.meta, { color: colors.neutral500 }]}>
        {t('soundSession.step.noClip')}
      </Text>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {clips.map(c => (
        <Button
          key={c.word}
          size={44}
          variant="secondary"
          icon="SpeakerHigh"
          label={clips.length === 1 ? t('soundSession.step.listen') : c.word}
          accessibilityLabel={`${t('soundSession.step.listen')}: ${c.word}`}
          onPress={() => {
            void player.play({ id: c.word, url: c.url });
          }}
        />
      ))}
    </View>
  );
}
