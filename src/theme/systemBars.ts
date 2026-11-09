import { NativeModules, Platform } from 'react-native';

interface SystemBarsNative {
  setNavigationBar(color: string, darkIcons: boolean): void;
}

/**
 * Paints the Android navigation bar. A no-op on iOS and in builds that predate
 * the native module (tests, an APK not yet rebuilt).
 */
export function setNavigationBar(color: string, isDark: boolean): void {
  if (Platform.OS !== 'android') return;
  const native = NativeModules.SystemBars as SystemBarsNative | undefined;
  native?.setNavigationBar(color, !isDark);
}
