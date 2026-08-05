import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ColorScheme } from '../../../theme/colors';
import { useTheme } from '../../../providers/ThemeProvider';

interface HomeHeaderProps {
  name: string;
  avatar: string;
  streak: number;
  xp: number;
}

export function HomeHeader({
  name,
  avatar,
  streak,
  xp,
}: HomeHeaderProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.userInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{avatar}</Text>
        </View>
        <View>
          <Text style={styles.greeting}>God dag,</Text>
          <Text style={styles.name}>{name} 👋</Text>
        </View>
      </View>

      <View style={styles.badges}>
        <View style={[styles.badge, { backgroundColor: '#fff3e0' }]}>
          <Text style={styles.badgeIcon}>🔥</Text>
          <Text style={[styles.badgeValue, { color: '#ff9f43' }]}>
            {streak}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: '#f0edff' }]}>
          <Text style={styles.badgeIcon}>⭐</Text>
          <Text style={[styles.badgeValue, { color: colors.accent }]}>
            {xp >= 1000 ? `${(xp / 1000).toFixed(1)}k` : xp}
          </Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 16,
    },
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    avatarText: {
      fontSize: 22,
    },
    greeting: {
      fontSize: 12,
      color: colors.textMuted,
    },
    name: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    badges: {
      flexDirection: 'row',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginLeft: 8,
    },
    badgeIcon: {
      fontSize: 14,
      marginRight: 4,
    },
    badgeValue: {
      fontSize: 13,
      fontWeight: '700',
    },
  });
