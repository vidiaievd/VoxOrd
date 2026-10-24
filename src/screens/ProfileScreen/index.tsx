import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/ui';
import { useTranslation } from '../../i18n';
import { useTabScrollToTop } from '../../navigation/tabScroll';
import { useTheme } from '../../providers/ThemeProvider';
import type { ColorScheme } from '../../theme/colors';
import type { Typography } from '../../theme/typography';

interface ProfileScreenProps {
  onOpenSettings: () => void;
}

/**
 * The Profile tab's root — for now its header alone (Profile §5.2 block 1), the gear leading
 * to Settings. Plan 07 builds the rest.
 */
export function ProfileScreen({ onOpenSettings }: ProfileScreenProps) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const styles = makeStyles(colors, typography);
  const scrollRef = useRef<ScrollView>(null);
  useTabScrollToTop('Profile', scrollRef);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('nav.profile')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.title')}
            onPress={onOpenSettings}
            style={styles.gear}
          >
            {({ pressed }) => (
              <Icon
                name="GearSix"
                size={23}
                color={pressed ? colors.accent300 : colors.neutral400}
              />
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme, typography: Typography) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: {
      paddingTop: 10,
      paddingHorizontal: 18,
      paddingBottom: 24,
      gap: 14,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: { ...typography.h1, color: colors.text },
    gear: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      // Optical alignment with the gutter (Profile §5.2).
      marginRight: -8,
    },
  });
