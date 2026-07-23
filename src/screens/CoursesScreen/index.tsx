import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n';
import { useTheme } from '../../providers/ThemeProvider';
import { ColorScheme } from '../../theme/colors';
import { useAuth } from '../../hooks/useAuth';
import { LoginForm } from './LoginForm';

export function CoursesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { status } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('courses.title')}</Text>
      </View>

      {status === 'restoring' && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}

      {status === 'signedOut' && <LoginForm />}

      {status === 'signedIn' && (
        <View style={styles.centerFill}>
          <Text style={styles.emptyTitle}>{t('courses.noCoursesYet')}</Text>
          <Text style={styles.emptyDesc}>{t('courses.noCoursesYetDesc')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 24,
      paddingTop: 8,
      paddingBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.textPrimary,
    },
    centerFill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptyDesc: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
