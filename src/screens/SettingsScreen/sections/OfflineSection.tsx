import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { useAuth } from '../../../hooks/useAuth';
import { courseDownloader } from '../../../services/courseDownload';

function formatTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * When the courses were last downloaded for use without the network, and a way to download
 * them now (offline plan, B3). The download runs by itself when the connection comes back;
 * this is for the learner about to leave it.
 */
export function OfflineSection() {
  const { t } = useTranslation();
  const { status: authStatus, offline } = useAuth();
  const [status, setStatus] = useState(courseDownloader.getStatus());

  useEffect(() => {
    const unsubscribe = courseDownloader.subscribe(() => setStatus(courseDownloader.getStatus()));
    void courseDownloader.loadStatus();
    return unsubscribe;
  }, []);

  if (authStatus !== 'signedIn') return null;

  const value = status.running
    ? t('settings.offlineDownloading')
    : status.lastFinishedAt !== null
      ? formatTime(status.lastFinishedAt)
      : t('settings.offlineNever');

  return (
    <SettingsSection title={t('settings.offline')}>
      <SettingsRow
        type="select"
        icon="⬇️"
        label={t('settings.offlineDownload')}
        value={value}
        onPress={() => {
          // Offline there is nothing to download from; the row still says when it last was.
          if (status.running || offline) return;
          void courseDownloader.run(true).catch(e => console.warn('[CourseDownload] failed:', e));
        }}
        isLast
      />
    </SettingsSection>
  );
}
