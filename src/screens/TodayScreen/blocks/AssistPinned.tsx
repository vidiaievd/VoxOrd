import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import type { AssistContext } from '../../../api/assistant';
import { Icon } from '../../../components/ui';
import { useAssistantAvailability } from '../../../hooks/useAssistantAvailability';
import { useTranslation } from '../../../i18n';
import type { Screen } from '../../../navigation/screens';
import { useTheme } from '../../../providers/ThemeProvider';

interface AssistPinnedProps {
  offline: boolean;
  onNavigate: (screen: Screen) => void;
}

const FREE: AssistContext = { kind: 'free' };

/** True while the software keyboard is up. */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * Block D-pin (D): the assistant's line pinned between the scroll and the tab bar — a free
 * question, or straight into voice from the microphone. Drawn when the server takes a free
 * question; gone with the keyboard up and offline (the assistant needs the network), with
 * nothing in its place.
 */
export function AssistPinned({ offline, onNavigate }: AssistPinnedProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const keyboard = useKeyboardShown();
  const { available } = useAssistantAvailability(FREE);
  if (offline || keyboard || !available) return null;

  const open = (startVoice: boolean) =>
    onNavigate({
      name: 'Assistant',
      context: FREE,
      ...(startVoice ? { startVoice } : {}),
      returnTo: { name: 'Today' },
    });

  return (
    <View
      style={{
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderTopColor: colors.neutral800,
        backgroundColor: colors.bg,
      }}
    >
      <View
        style={{
          height: 44,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.accent700,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.assist.askPlain')}
          onPress={() => open(false)}
          style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14 }}
        >
          <Icon name="Sparkle" size={16} color={colors.accent300} />
          <Text style={[typography.secondary, { fontSize: 14, color: colors.neutral500, flex: 1 }]} numberOfLines={1}>
            {t('today.assist.askPlain')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('today.assist.voice')}
          onPress={() => open(true)}
          hitSlop={6}
          style={{ width: 36, height: 36, borderRadius: 18, marginRight: 4, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="Microphone" size={18} color={colors.neutral300} />
        </Pressable>
      </View>
    </View>
  );
}
