import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import {
  Button,
  Card,
  ICON_NAMES,
  Icon,
  NavHeader,
  Overline,
  PressableScale,
  ProgressTrack,
  SegmentedControl,
  Skeleton,
  Tag,
  useToast,
} from '../../components/ui';

/**
 * Dev-only showcase of the Nocturne primitives (redesign plan 01, step 3).
 * Flip the theme in Settings and reopen to compare both schemes.
 */
export function UiKitScreen({ onClose }: { onClose: () => void }) {
  const { colors, typography, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [seg, setSeg] = useState<'a' | 'b'>('a');

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}
    >
      <NavHeader
        parentLabel="Settings"
        onBack={onClose}
        right={{
          icon: 'GearSix',
          accessibilityLabel: 'Gear',
          onPress: () => toast.show('Toast, 2.5 s'),
        }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Text style={[typography.h1, { color: colors.text }]}>
          UI kit · {isDark ? 'dark' : 'light'}
        </Text>

        <Overline>Cards</Overline>
        <Card variant="plain">
          <Text style={[typography.body, { color: colors.text }]}>plain</Text>
        </Card>
        <Card variant="lit">
          <Text style={[typography.body, { color: colors.text }]}>lit</Text>
        </Card>
        <Card variant="outline">
          <Text style={[typography.body, { color: colors.text }]}>outline</Text>
        </Card>

        <Overline>Buttons</Overline>
        <Button label="Continue" icon="Play" block />
        <Button label="Secondary" variant="secondary" block size={44} />
        <Button label="Ghost" variant="ghost" size={40} />
        <Button label="Disabled" disabled size={36} />
        <Button
          iconOnly
          icon="TextAa"
          variant="secondary"
          size={44}
          accessibilityLabel="Text size"
        />

        <Overline>Tags</Overline>
        <View style={styles.row}>
          <Tag label="accent" variant="accent" />
          <Tag label="outline" variant="outline" />
          <Tag label="neutral" />
        </View>

        <Overline>Progress · Segmented</Overline>
        <ProgressTrack value={0.4} />
        <SegmentedControl
          options={[
            { value: 'a', label: 'My courses' },
            { value: 'b', label: 'Catalogue' },
          ]}
          value={seg}
          onChange={setSeg}
        />

        <Overline>Skeleton · PressableScale</Overline>
        <Skeleton height={20} />
        <PressableScale
          style={{
            padding: 14,
            borderRadius: 14,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={[typography.body, { color: colors.text }]}>Hold me</Text>
        </PressableScale>

        <Overline>{`Icons (${ICON_NAMES.length})`}</Overline>
        <View style={styles.icons}>
          {ICON_NAMES.map(n => (
            <Icon key={n} name={n} size={25} color={colors.neutral300} />
          ))}
        </View>
        <View style={styles.row}>
          <Icon name="Cards" size={25} color={colors.accent300} weight="fill" />
          <Icon name="Cards" size={25} color={colors.neutral500} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, gap: 14 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
});
