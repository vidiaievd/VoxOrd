import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../components/ui';
import { useTheme } from '../../providers/ThemeProvider';

interface MessageLayoutProps {
  icon: IconName;
  title: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
}

/**
 * The body of «quota met» (6b) and «nothing due» (6j), Practice §7.1: left-aligned and centred
 * vertically, a 36 `accent300` icon over a 26/30 title, the buttons pinned below.
 */
export function MessageLayout({ icon, title, children, footer }: MessageLayoutProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingHorizontal: 28,
          paddingBottom: 40,
          gap: 14,
        }}
      >
        <Icon name={icon} size={36} color={colors.accent300} />
        <Text
          accessibilityRole="header"
          style={{ fontSize: 26, lineHeight: 30, fontWeight: '500', color: colors.text }}
        >
          {title}
        </Text>
        {children}
      </ScrollView>
      <View
        style={{
          paddingTop: 12,
          paddingHorizontal: 20,
          paddingBottom: 12 + insets.bottom,
          gap: 10,
        }}
      >
        {footer}
      </View>
    </View>
  );
}
