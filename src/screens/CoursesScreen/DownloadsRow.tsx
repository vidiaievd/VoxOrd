import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../../i18n';
import { Icon, PressableScale } from '../../components/ui';
import { mediaCache } from '../../services/mediaCache';
import { courseDownloader } from '../../services/courseDownload';
import { ALL_UNITS, settingsStore } from '../../store/settingsStore';

interface Props {
  /** How many of the learner's courses are walked by the downloader. */
  courseCount: number;
  onPress: () => void;
}

/** «1,2 GB», «64 MB» — the same units as Settings ▸ «On the phone». */
function formatSize(bytes: number, t: ReturnType<typeof useTranslation>['t']): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? t('coursesTab.sizeGb', { n: (mb / 1024).toFixed(1) }) : t('coursesTab.sizeMb', { n: Math.round(mb) });
}

/** The row under the course list that leads to Settings ▸ «On the phone» (Courses spec §5.2, block 3). */
export function DownloadsRow({ courseCount, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, typography } = useTheme();
  const [bytes, setBytes] = useState<number | null>(null);
  const [settings, setSettings] = useState(settingsStore.getAll());

  const read = useCallback(() => {
    mediaCache.totalBytes().then(setBytes).catch(() => setBytes(null));
  }, []);

  useEffect(() => {
    read();
    const offSettings = settingsStore.subscribe(() => setSettings(settingsStore.getAll()));
    // Re-read when a walk ends, so the size is not the one from before it.
    const offWalk = courseDownloader.subscribe(() => {
      if (!courseDownloader.getStatus().running) read();
    });
    return () => {
      offSettings();
      offWalk();
    };
  }, [read]);

  if (!bytes) return null;

  const hint = settings.offlineMediaOnCellular
    ? t('coursesTab.nextUnits', { count: settings.offlineUnitsAhead })
    : t('coursesTab.nextUnitsWifi', { count: settings.offlineUnitsAhead });

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: colors.neutral800,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <Icon name="DeviceMobile" size={20} color={colors.neutral400} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.secondary, { color: colors.neutral300 }]}>
          {t('coursesTab.onPhone', { count: courseCount, size: formatSize(bytes, t) })}
        </Text>
        {settings.offlineUnitsAhead !== ALL_UNITS && (
          <Text style={[typography.meta, { color: colors.neutral500 }]}>{hint}</Text>
        )}
      </View>
      <Icon name="CaretRight" size={16} color={colors.neutral600} />
    </PressableScale>
  );
}
