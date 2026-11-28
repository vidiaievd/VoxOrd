import { NativeModules, Platform } from 'react-native';

// The package's version: the APK's name is built from it too (android/app/build.gradle).
const PACKAGE_VERSION: string = require('../../package.json').version;

export interface BuildInfo {
  /** `0.0.1`. */
  version: string;
  /** The APK's number (grows with every commit), or `null` where the native side has none. */
  build: string | null;
  /** Short commit the APK was built from, or `null`. */
  commit: string | null;
  /** `debug` / `release`, or `null`. */
  buildType: string | null;
}

interface BuildInfoNative {
  versionName?: string;
  versionCode?: string;
  commit?: string;
  buildType?: string;
  getConstants?: () => BuildInfoNative;
}

function nonEmpty(value: string | undefined): string | null {
  return value && value !== 'unknown' ? value : null;
}

/**
 * What build is running. An APK built before the native module (or iOS, or tests) answers
 * the package version only.
 */
export function readBuildInfo(): BuildInfo {
  const native =
    Platform.OS === 'android'
      ? (NativeModules.BuildInfo as BuildInfoNative | undefined)
      : undefined;
  const constants = native?.getConstants?.() ?? native;
  return {
    version: nonEmpty(constants?.versionName) ?? PACKAGE_VERSION,
    build: nonEmpty(constants?.versionCode),
    commit: nonEmpty(constants?.commit),
    buildType: nonEmpty(constants?.buildType),
  };
}

/** `0.0.1 (412 · a1b2c3d)` — the line «About» shows and a crash report carries. */
export function formatBuildLabel(info: BuildInfo): string {
  const extra = [info.build, info.commit].filter(Boolean).join(' · ');
  return extra ? `${info.version} (${extra})` : info.version;
}
