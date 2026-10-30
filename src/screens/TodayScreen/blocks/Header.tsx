import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from '../../../i18n';
import { useTheme } from '../../../providers/ThemeProvider';
import { buildDayLine } from '../dayLine';

interface HeaderProps {
  name: string | null;
  offline: boolean;
  hasCourses: boolean;
  dueCount: number;
  nextClassAt: Date | null;
  /** Off in variant D, whose plan for today says what is on. */
  showDayLine?: boolean;
}

/** «Tuesday, 24 October» with a capital — the locale gives it in lower case. */
function dateLine(now: Date, language: string): string {
  try {
    const text = new Intl.DateTimeFormat(language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(now);
    return text.charAt(0).toUpperCase() + text.slice(1);
  } catch {
    return '';
  }
}

/** Block 1: the date, the greeting and the one thing that is on today. */
export function Header({
  name,
  offline,
  hasCourses,
  dueCount,
  nextClassAt,
  showDayLine = true,
}: HeaderProps) {
  const { t, language } = useTranslation();
  const { colors, typography } = useTheme();
  const now = new Date();
  const dayLine = buildDayLine({ offline, hasCourses, dueCount, nextClassAt, now }, t);

  return (
    <View style={{ gap: 3 }}>
      <Text style={[typography.overline, { color: colors.neutral500 }]}>
        {dateLine(now, language)}
      </Text>
      <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
        {name ? t('today.greeting', { name }) : t('today.greetingPlain')}
      </Text>
      {showDayLine ? <Text style={[typography.body, { color: colors.neutral400 }]}>{dayLine}</Text> : null}
    </View>
  );
}
