import React from 'react';
import { Text, View } from 'react-native';
import { Icon, PressableScale } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { radii } from '../../theme/spacing';

/** The pronunciation session's entry (platform plan 86, VoxOrd step 15.3). */
export function SoundSessionCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${t('soundSession.practiceTitle')}. ${t('soundSession.practiceSub')}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: radii.card,
        paddingVertical: 13,
        paddingHorizontal: 16,
      }}
    >
      <Icon name="Microphone" size={20} color={colors.neutral300} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.body, { color: colors.text }]}>
          {t('soundSession.practiceTitle')}
        </Text>
        <Text style={[typography.meta, { color: colors.neutral500 }]}>
          {t('soundSession.practiceSub')}
        </Text>
      </View>
      <Icon name="CaretRight" size={16} color={colors.neutral600} />
    </PressableScale>
  );
}
