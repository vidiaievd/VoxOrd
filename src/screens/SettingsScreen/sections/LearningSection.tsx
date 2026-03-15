import React from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { settingsStore } from '../../../store/settingsStore';
import { useSettings } from '../../../hooks/useSettings';
import { useTranslation } from '../../../i18n';
import { useModal } from '../../../providers/ModalProvider';

const SESSION_OPTIONS = [10, 20, 30, 50];

export function LearningSection() {
  const settings = useSettings();
  const { t } = useTranslation();
  const { show } = useModal();

  const handleSessionPress = () => {
    show({
      type: 'picker',
      title: t('settings.cardsPerSession'),
      options: SESSION_OPTIONS.map(n => ({
        value: n,
        label: String(n),
      })),
      current: settings.cardsPerSession,
      onSelect: v => settingsStore.set('cardsPerSession', v),
      closeLabel: t('common.close'),
    });
  };

  return (
    <SettingsSection title={t('settings.sectionLearning')}>
      <SettingsRow
        type="navigate"
        icon="🃏"
        label={t('settings.cardModes')}
        badge={t('settings.cardModesActive', {
          count: settings.cardModes.length,
        })}
        onPress={() => {}}
      />
      <SettingsRow
        type="select"
        icon="🔢"
        label={t('settings.cardsPerSession')}
        value={String(settings.cardsPerSession)}
        onPress={handleSessionPress}
      />
      <SettingsRow
        type="toggle"
        icon="📖"
        label={t('settings.showWordForms')}
        value={settings.showWordForms}
        onChange={v => settingsStore.set('showWordForms', v)}
      />
      <SettingsRow
        type="toggle"
        icon="🔗"
        label={t('settings.showOrdbokenLink')}
        value={settings.showOrdbokenLink}
        onChange={v => settingsStore.set('showOrdbokenLink', v)}
      />
      <SettingsRow
        type="select"
        icon="💡"
        label={t('settings.spellingHint')}
        value={t(`settings.spellingHint_${settings.spellingHintMode}`)}
        onPress={() =>
          show({
            type: 'picker',
            title: t('settings.spellingHint'),
            options: [
              { value: 'always', label: t('settings.spellingHint_always') },
              {
                value: 'after_mistake',
                label: t('settings.spellingHint_after_mistake'),
              },
              { value: 'never', label: t('settings.spellingHint_never') },
            ],
            current: settings.spellingHintMode,
            onSelect: v => settingsStore.set('spellingHintMode', v),
            closeLabel: t('common.close'),
          })
        }
        isLast
      />
    </SettingsSection>
  );
}
