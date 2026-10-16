import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { useAuth } from '../../../hooks/useAuth';
import { useSettings } from '../../../hooks/useSettings';
import { useModal } from '../../../providers/ModalProvider';
import { courseDownloader } from '../../../services/courseDownload';
import { mediaCache } from '../../../services/mediaCache';
import { ALL_UNITS, settingsStore } from '../../../store/settingsStore';

const UNITS_AHEAD_OPTIONS = [1, 2, 3, 5, ALL_UNITS];

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Downloading the courses for use without the network (offline plan, B3): how far ahead, whether
 * media may use mobile data, when it last ran and how much the media take. The download runs by
 * itself when the connection comes back; «download now» is for the learner about to leave it.
 */
export function OfflineSection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { show } = useModal();
  const { status: authStatus, offline } = useAuth();
  const [status, setStatus] = useState(courseDownloader.getStatus());
  const [mediaBytes, setMediaBytes] = useState<number | null>(null);

  const readMediaBytes = useCallback(() => {
    mediaCache
      .totalBytes()
      .then(setMediaBytes)
      .catch(() => setMediaBytes(null));
  }, []);

  useEffect(() => {
    const unsubscribe = courseDownloader.subscribe(() => {
      const next = courseDownloader.getStatus();
      setStatus(next);
      if (!next.running) readMediaBytes();
    });
    void courseDownloader.loadStatus();
    readMediaBytes();
    return unsubscribe;
  }, [readMediaBytes]);

  if (authStatus !== 'signedIn') return null;

  const unitsLabel = (n: number) =>
    n === ALL_UNITS ? t('settings.offlineUnitsAll') : String(n);

  const downloadValue = status.running
    ? t('settings.offlineDownloading')
    : status.lowStorage
      ? t('settings.offlineLowStorage')
      : status.lastFinishedAt !== null
        ? formatTime(status.lastFinishedAt)
        : t('settings.offlineNever');

  /** A changed window or allowance is worth acting on at once, not at the next sync. */
  const downloadNow = () => {
    // Offline there is nothing to download from; the rows still say what is kept.
    if (offline) return;
    void courseDownloader.run(true).catch(e => console.warn('[CourseDownload] failed:', e));
  };

  return (
    <SettingsSection title={t('settings.offline')}>
      <SettingsRow
        type="select"
        icon="📚"
        label={t('settings.offlineUnitsAhead')}
        value={unitsLabel(settings.offlineUnitsAhead)}
        onPress={() =>
          show({
            type: 'picker',
            title: t('settings.offlineUnitsAhead'),
            options: UNITS_AHEAD_OPTIONS.map(n => ({ value: n, label: unitsLabel(n) })),
            current: settings.offlineUnitsAhead,
            onSelect: async v => {
              await settingsStore.set('offlineUnitsAhead', v);
              downloadNow();
            },
            closeLabel: t('common.close'),
          })
        }
      />
      <SettingsRow
        type="toggle"
        icon="📶"
        label={t('settings.offlineMediaOnCellular')}
        value={settings.offlineMediaOnCellular}
        onChange={async on => {
          await settingsStore.set('offlineMediaOnCellular', on);
          if (on) downloadNow();
        }}
      />
      <SettingsRow
        type="select"
        icon="⬇️"
        label={t('settings.offlineDownload')}
        value={downloadValue}
        onPress={() => {
          if (!status.running) downloadNow();
        }}
      />
      <SettingsRow
        type="select"
        icon="🗑️"
        label={t('settings.offlineMediaClear')}
        value={mediaBytes === null ? '—' : formatBytes(mediaBytes)}
        onPress={() =>
          show({
            type: 'confirm',
            title: t('settings.offlineMediaClear'),
            message: t('settings.offlineMediaClearMessage'),
            confirmLabel: t('settings.offlineMediaClear'),
            cancelLabel: t('common.cancel'),
            onConfirm: () => {
              void mediaCache.clear().then(readMediaBytes);
            },
          })
        }
        isLast
      />
    </SettingsSection>
  );
}
