import React from 'react';
import { SettingsGroup, SettingsRow } from '../../../components/ui';
import { useSchools } from '../../../hooks/useSchools';
import { useSettings } from '../../../hooks/useSettings';
import { useTranslation } from '../../../i18n';
import { useModal } from '../../../providers/ModalProvider';
import { settingsStore } from '../../../store/settingsStore';
import { REMINDER_TIMES } from '../settingsModel';

export function NotificationsGroup() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { show } = useModal();
  const { schools } = useSchools();
  const time = settings.notifReviewReminderTime;

  const pickTime = () =>
    show({
      type: 'picker',
      title: t('settings.reviewReminderTime'),
      options: REMINDER_TIMES.map(value => ({ value, label: value })),
      current: time,
      onSelect: v => settingsStore.set('notifReviewReminderTime', v),
      closeLabel: t('common.close'),
    });

  return (
    <SettingsGroup title={t('settings.notificationsGroup')}>
      <SettingsRow
        isFirst
        type="toggle"
        icon="Repeat"
        label={t('settings.reviewReminder')}
        sub={t('settings.reviewReminderEvery', { time })}
        value={settings.notifReviewReminder}
        onChange={v => settingsStore.set('notifReviewReminder', v)}
      />
      {settings.notifReviewReminder ? (
        <SettingsRow
          type="navigate"
          icon="Clock"
          label={t('settings.reviewReminderTime')}
          value={time}
          onPress={pickTime}
        />
      ) : null}
      <SettingsRow
        type="toggle"
        icon="ChatCenteredText"
        label={t('settings.notifWork')}
        value={settings.notifWork}
        onChange={v => settingsStore.set('notifWork', v)}
      />
      {schools && schools.length > 0 ? (
        <SettingsRow
          type="toggle"
          icon="Megaphone"
          label={t('settings.notifSchool')}
          value={settings.notifSchool}
          onChange={v => settingsStore.set('notifSchool', v)}
        />
      ) : null}
    </SettingsGroup>
  );
}
