import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/ui';
import { useTranslation } from '../i18n';
import { useTheme } from '../providers/ThemeProvider';
import type { ColorScheme } from '../theme/colors';
import type { Typography } from '../theme/typography';
import { TABS, type Tab } from './screens';
import { badgeText, tabAccessibilityLabel } from './tabBadge';

const ICON: Record<Tab, IconName> = {
  Today: 'SunHorizon',
  Courses: 'GraduationCap',
  Practice: 'Cards',
  Notifications: 'Bell',
  Profile: 'UserCircle',
};

const LABEL_KEY = {
  Today: 'nav.today',
  Courses: 'nav.courses',
  Practice: 'nav.practice',
  Notifications: 'nav.notifications',
  Profile: 'nav.profile',
} as const satisfies Record<Tab, string>;

export interface TabBarProps {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
  /** Counts behind the badges: Practice — cards due now, Notifications — unread. */
  badges: Partial<Record<Tab, number | null>>;
}

/**
 * The five tabs (Home §4.3). Each platform gets its own bar: iOS a flat strip with a hairline
 * over it, Android a Material bar with a pill behind the active icon.
 */
export function TabBar({ activeTab, onTabPress, badges }: TabBarProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const styles = ios
    ? iosStyles(colors, typography)
    : androidStyles(colors, typography);

  const badgeWords = (
    tab: Tab,
    count: number | null | undefined,
  ): string | null => {
    if (badgeText(count) === null) return null;
    if (tab === 'Practice') return t('nav.practiceDue', { count: count! });
    if (tab === 'Notifications')
      return t('nav.notificationsUnread', { count: count! });
    return null;
  };

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          height: (ios ? 49 : 80) + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {TABS.map(tab => {
        const active = tab === activeTab;
        const label = t(LABEL_KEY[tab]);
        const badge = badgeText(badges[tab]);
        const tint = ios
          ? active
            ? colors.accent300
            : colors.neutral500
          : active
          ? colors.text
          : colors.neutral400;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tabAccessibilityLabel(
              label,
              badgeWords(tab, badges[tab]),
            )}
            onPress={() => onTabPress(tab)}
            android_ripple={{
              color: colors.accent800,
              borderless: true,
              radius: 32,
            }}
            style={({ pressed }) => [
              styles.item,
              ios && pressed && { opacity: 0.7 },
            ]}
          >
            <View style={[styles.iconBox, active && styles.iconBoxActive]}>
              <Icon
                name={ICON[tab]}
                size={ios ? 25 : 22}
                color={tint}
                weight={active ? 'fill' : 'regular'}
              />
              {badge !== null && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} allowFontScaling={false}>
                    {badge}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.label, { color: tint }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function iosStyles(colors: ColorScheme, typography: Typography) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: colors.bg,
      borderTopWidth: 1,
      borderTopColor: colors.neutral800,
    },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
    iconBox: { width: 25, height: 25 },
    iconBoxActive: {},
    badge: {
      position: 'absolute',
      top: -2,
      // Home §4.3: left edge at the icon's centre + 6.
      left: 25 / 2 + 6,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      backgroundColor: colors.accent700,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      ...typography.tabLabel,
      fontSize: 10,
      lineHeight: 12,
      color: colors.accent100,
    },
    label: typography.tabLabel,
  });
}

function androidStyles(colors: ColorScheme, typography: Typography) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', backgroundColor: colors.surface },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
    iconBox: {
      width: 56,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBoxActive: { backgroundColor: colors.accent800 },
    badge: {
      position: 'absolute',
      top: 0,
      right: 6,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: colors.accent600,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      ...typography.tabLabel,
      fontSize: 10,
      lineHeight: 12,
      color: colors.accent100,
    },
    label: typography.tabLabel,
  });
}
