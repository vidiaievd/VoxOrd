import React, { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Card } from './Card';
import { Icon } from './Icon';

export interface SubScreenProps {
  /** Title of the parent screen: «Profile» or «Settings». */
  backLabel: string;
  onBack: () => void;
  title: string;
  hero?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

/** Shared frame of Settings, AppLanguage, Account, Subscription and School. */
export function SubScreen({
  backLabel,
  onBack,
  title,
  hero,
  footer,
  children,
}: SubScreenProps) {
  const { colors, typography } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: 10,
        paddingHorizontal: spacing.screenGutter,
        paddingBottom: 24,
        gap: spacing.blockGap,
      }}
    >
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          style={{
            height: 36,
            alignSelf: 'flex-start',
            marginLeft: -8,
            paddingRight: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Icon name="CaretLeft" size={20} color={colors.accent300} />
          <Text style={[typography.cardTitle, { color: colors.accent300 }]}>
            {backLabel}
          </Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[typography.h1, { color: colors.text, marginTop: 4 }]}
        >
          {title}
        </Text>
      </View>
      {hero}
      {children}
      {footer ? <View style={{ gap: spacing.blockGap }}>{footer}</View> : null}
    </ScrollView>
  );
}

export interface SubScreenHeroProps {
  overline?: string;
  title: string;
  meta?: string;
}

/** Lit card at the top of a sub-screen (subscription, school). */
export function SubScreenHero({ overline, title, meta }: SubScreenHeroProps) {
  const { colors, typography } = useTheme();
  return (
    <Card variant="lit" style={{ gap: 4 }}>
      {overline ? (
        <Text style={[typography.overline, { color: colors.accent300 }]}>
          {overline}
        </Text>
      ) : null}
      <Text
        style={[
          typography.cardTitleMedium,
          {
            color: colors.text,
            fontSize: 20,
            lineHeight: 24,
            letterSpacing: -0.2,
            marginTop: 4,
          },
        ]}
      >
        {title}
      </Text>
      {meta ? (
        <Text style={[typography.secondary, { color: colors.neutral400 }]}>
          {meta}
        </Text>
      ) : null}
    </Card>
  );
}
