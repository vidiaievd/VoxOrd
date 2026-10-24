import React, { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import { useTheme } from '../../providers/ThemeProvider';
import type { ColorScheme } from '../../theme/colors';
import type { Typography } from '../../theme/typography';

/**
 * The Notifications tab's root — the empty state of the feed (Notifications §7) until plan
 * 06 gives it something to list.
 */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const styles = makeStyles(colors, typography);
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop('Notifications', scrollRef);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          {t('notifications.title')}
        </Text>
        <View style={styles.empty}>
          <Icon name="Bell" size={28} color={colors.neutral600} />
          <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
          <Text style={styles.emptyBody}>{t('notifications.emptyBody')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme, typography: Typography) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 24 },
    title: { ...typography.h1, color: colors.text },
    empty: { paddingTop: 48 },
    emptyTitle: {
      ...typography.cardTitleMedium,
      color: colors.text,
      marginTop: 12,
    },
    emptyBody: {
      ...typography.secondary,
      lineHeight: 18,
      color: colors.neutral400,
      marginTop: 4,
    },
  });
