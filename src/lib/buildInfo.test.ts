import { NativeModules, Platform } from 'react-native';
import { formatBuildLabel, readBuildInfo } from './buildInfo';

const PACKAGE_VERSION: string = require('../../package.json').version;

describe('readBuildInfo', () => {
  const realOS = Platform.OS;
  beforeAll(() => {
    // The jest preset is iOS; the module exists on Android only.
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: realOS, configurable: true });
  });

  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).BuildInfo;
  });

  it('reads the native constants', () => {
    (NativeModules as Record<string, unknown>).BuildInfo = {
      getConstants: () => ({
        versionName: '0.0.2',
        versionCode: '412',
        commit: 'a1b2c3d',
        buildType: 'release',
      }),
    };
    expect(readBuildInfo()).toEqual({
      version: '0.0.2',
      build: '412',
      commit: 'a1b2c3d',
      buildType: 'release',
    });
  });

  it('falls back to the package version on an APK without the module', () => {
    expect(readBuildInfo()).toEqual({
      version: PACKAGE_VERSION,
      build: null,
      commit: null,
      buildType: null,
    });
  });

  it('drops a commit gradle could not read', () => {
    (NativeModules as Record<string, unknown>).BuildInfo = {
      versionName: '0.0.2',
      versionCode: '7',
      commit: 'unknown',
      buildType: 'debug',
    };
    expect(readBuildInfo().commit).toBeNull();
  });
});

describe('formatBuildLabel', () => {
  it('adds the number and commit when known', () => {
    expect(
      formatBuildLabel({ version: '0.0.1', build: '412', commit: 'a1b2c3d', buildType: null }),
    ).toBe('0.0.1 (412 · a1b2c3d)');
  });

  it('is the bare version otherwise', () => {
    expect(formatBuildLabel({ version: '0.0.1', build: null, commit: null, buildType: null })).toBe(
      '0.0.1',
    );
  });
});
