import { LanguageCode } from '../../db/types';

/** The language word translations are shown in: the stored choice, else the interface language. */
export function resolveTranslationLanguage(
  stored: LanguageCode | null,
  uiLanguage: LanguageCode,
): LanguageCode {
  return stored ?? uiLanguage;
}

/** Reminder times offered in the picker: every hour from 07:00 to 22:00. */
export const REMINDER_TIMES = Array.from(
  { length: 16 },
  (_, i) => `${String(i + 7).padStart(2, '0')}:00`,
);

/** «Download ahead» is stored as a number of units; the whole course is `ALL_UNITS`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** «Only on Wi-Fi» is the inverse of the stored `offlineMediaOnCellular`. */
export const wifiOnlyFromSetting = (offlineMediaOnCellular: boolean) =>
  !offlineMediaOnCellular;
export const settingFromWifiOnly = (wifiOnly: boolean) => !wifiOnly;
