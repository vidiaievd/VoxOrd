import React from 'react';
import { Text, View } from 'react-native';
import { Icon, PressableScale, Tag } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import type { Deck } from '../../repositories/DeckRepository';

/**
 * A word set in the list (Practice §5.4, list row): its name, how many words, and — when
 * some are due — the count in a tag. The course and unit of a set are not kept on the phone,
 * so the line is the word count alone.
 */
export function DeckRow({ deck, onPress }: { deck: Deck; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const meta = t('practice.deckMetaPersonal', { count: deck.totalWords });
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${deck.title}. ${meta}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        borderTopWidth: 1,
        borderTopColor: colors.neutral800,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.cardTitle, { color: colors.text }]} numberOfLines={1}>
          {deck.title}
        </Text>
        <Text style={[typography.meta, { color: colors.neutral500 }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {deck.repeatWords > 0 ? <Tag variant="accent" label={String(deck.repeatWords)} /> : null}
      <Icon name="CaretRight" size={16} color={colors.neutral600} />
    </PressableScale>
  );
}
