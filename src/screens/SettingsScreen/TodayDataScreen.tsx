import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { NavHeader, Overline } from '../../components/ui';
import { useEntitlements } from '../../hooks/useEntitlements';
import { useNextClass } from '../../hooks/useNextClass';
import { useSchools } from '../../hooks/useSchools';
import { aiCaps, resolveVariant } from '../TodayScreen/variant';

/**
 * Dev-only: what Today's data ports read for the signed-in learner (redesign plan 02, step 2),
 * before any block draws it. English on purpose.
 */
export function TodayDataScreen({ onClose }: { onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, schools } = useSchools();
  const { nextClass } = useNextClass(schools);
  const { entitlements } = useEntitlements(schools, status);

  const sections: [string, unknown][] = [
    ['variant', resolveVariant({ schools, entitlements })],
    ['ai caps', aiCaps(entitlements)],
    [`schools (${status})`, schools],
    ['next class', nextClass],
    ['entitlements', entitlements],
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <NavHeader parentLabel="Settings" onBack={onClose} />
      <ScrollView contentContainerStyle={styles.content}>
        {sections.map(([title, value]) => (
          <View key={title} style={styles.section}>
            <Overline>{title}</Overline>
            <Text selectable style={[styles.json, { color: colors.text }]}>
              {JSON.stringify(value, null, 2)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16 },
  section: { gap: 6 },
  json: { fontFamily: 'monospace', fontSize: 11 },
});
