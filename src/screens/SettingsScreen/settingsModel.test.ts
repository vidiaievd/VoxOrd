import {
  REMINDER_TIMES,
  formatBytes,
  resolveTranslationLanguage,
  settingFromWifiOnly,
  wifiOnlyFromSetting,
} from './settingsModel';

describe('settingsModel', () => {
  it('«Only on Wi-Fi» is the inverse of offlineMediaOnCellular, both ways', () => {
    expect(wifiOnlyFromSetting(false)).toBe(true);
    expect(wifiOnlyFromSetting(true)).toBe(false);
    expect(settingFromWifiOnly(true)).toBe(false);
    expect(settingFromWifiOnly(false)).toBe(true);
  });

  it('translation language follows the interface language until chosen', () => {
    expect(resolveTranslationLanguage(null, 'uk')).toBe('uk');
    expect(resolveTranslationLanguage('en', 'uk')).toBe('en');
  });

  it('offers hourly reminder times from 07:00 to 22:00', () => {
    expect(REMINDER_TIMES[0]).toBe('07:00');
    expect(REMINDER_TIMES[REMINDER_TIMES.length - 1]).toBe('22:00');
  });

  it('formats sizes', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
