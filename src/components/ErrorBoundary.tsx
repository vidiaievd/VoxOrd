import React from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './ui';
import { useTranslation } from '../i18n';
import { useTheme } from '../providers/ThemeProvider';
import { typography } from '../theme/typography';
import { readBuildInfo } from '../lib/buildInfo';
import { formatCrashReport, getCurrentScreen } from '../lib/crashReport';

interface Props {
  children: React.ReactNode;
}

interface State {
  report: string | null;
}

/**
 * Catches a screen that throws while rendering, so a tester sees a way out and a report to
 * send instead of a red screen (debug) or an app that silently closes (release). Offline plan A3.
 * «Back to the app» mounts the navigator afresh, on Today.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { report: null };

  static getDerivedStateFromError(): Partial<State> {
    // The report itself is written in componentDidCatch, which has the component stack.
    return { report: '' };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const report = formatCrashReport({
      error,
      componentStack: info.componentStack,
      screen: getCurrentScreen(),
      build: readBuildInfo(),
      at: new Date(),
    });
    // Metro and `adb logcat` keep it too.
    console.error(report);
    this.setState({ report });
  }

  private reset = () => this.setState({ report: null });

  render() {
    if (this.state.report === null) return this.props.children;
    return <CrashScreen report={this.state.report} onRetry={this.reset} />;
  }
}

export function CrashScreen({ report, onRetry }: { report: string; onRetry: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const share = () => {
    // The system sheet: copy, a messenger or mail — the app needs no clipboard library.
    Share.share({ message: report }).catch(() => undefined);
  };
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <Text style={[typography.h1, { color: colors.text }]}>{t('crash.title')}</Text>
      <Text style={[typography.body, styles.body, { color: colors.textSecondary }]}>
        {t('crash.body')}
      </Text>
      <ScrollView
        style={[styles.report, { backgroundColor: colors.surface }]}
        contentContainerStyle={styles.reportContent}
      >
        <Text selectable style={[typography.meta, { color: colors.textSecondary }]}>
          {report}
        </Text>
      </ScrollView>
      <View style={styles.actions}>
        <Button label={t('crash.share')} onPress={share} disabled={!report} />
        <Button label={t('crash.retry')} variant="secondary" onPress={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  body: { marginTop: 12 },
  report: { flex: 1, marginTop: 16, borderRadius: 12 },
  reportContent: { padding: 12 },
  actions: { marginTop: 16, gap: 8 },
});
