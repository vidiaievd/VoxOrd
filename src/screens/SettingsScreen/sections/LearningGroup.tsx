import React from 'react';
import { SettingsGroup, SettingsRow } from '../../../components/ui';
import { useSettings } from '../../../hooks/useSettings';
import { useTranslation, useUiLanguage } from '../../../i18n';
import { useModal } from '../../../providers/ModalProvider';
import { LanguageCode } from '../../../db/types';
import { settingsStore } from '../../../store/settingsStore';
import { resolveTranslationLanguage } from '../settingsModel';

const GOAL_OPTIONS = [5, 10, 15, 20, 30];
const SESSION_OPTIONS = [10, 20, 30, 50];
const TRANSLATION_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'uk', label: 'Українська' },
  { value: 'en', label: 'English' },
];

export function LearningGroup() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { show } = useModal();
  const uiLanguage = useUiLanguage();
  const translation = resolveTranslationLanguage(
    settings.translationLanguage,
    uiLanguage,
  );
  const hintLabel = {
    always: t('settings.spellingHintAlways'),
    after_mistake: t('settings.spellingHintAfterMistake'),
    never: t('settings.spellingHintNever'),
  };

  return (
    <SettingsGroup title={t('settings.sectionLearning')}>
      <SettingsRow
        isFirst
        type="navigate"
        icon="Target"
        label={t('settings.dailyGoal')}
        value={t('settings.minutesValue', { n: settings.dailyGoalMin })}
        onPress={() =>
          show({
            type: 'picker',
            title: t('settings.dailyGoal'),
            options: GOAL_OPTIONS.map(n => ({
              value: n,
              label: t('settings.minutesValue', { n }),
            })),
            current: settings.dailyGoalMin,
            onSelect: v => settingsStore.set('dailyGoalMin', v),
            closeLabel: t('common.close'),
          })
        }
      />
      <SettingsRow
        type="navigate"
        icon="Translate"
        label={t('settings.translationLanguage')}
        value={
          TRANSLATION_OPTIONS.find(o => o.value === translation)?.label ??
          translation
        }
        onPress={() =>
          show({
            type: 'picker',
            title: t('settings.translationLanguage'),
            options: TRANSLATION_OPTIONS,
            current: translation,
            onSelect: v => settingsStore.set('translationLanguage', v),
            closeLabel: t('common.close'),
          })
        }
      />
      <SettingsRow
        type="navigate"
        icon="Cards"
        label={t('settings.cardModes')}
        value={t('settings.cardModesActive', {
          count: settings.cardModes.length,
        })}
        onPress={() => {}}
      />
      <SettingsRow
        type="navigate"
        icon="Stack"
        label={t('settings.cardsPerSession')}
        value={String(settings.cardsPerSession)}
        onPress={() =>
          show({
            type: 'picker',
            title: t('settings.cardsPerSession'),
            options: SESSION_OPTIONS.map(n => ({ value: n, label: String(n) })),
            current: settings.cardsPerSession,
            onSelect: v => settingsStore.set('cardsPerSession', v),
            closeLabel: t('common.close'),
          })
        }
      />
      <SettingsRow
        type="toggle"
        icon="SpeakerHigh"
        label={t('settings.autoplayAudio')}
        value={settings.autoplayAudio}
        onChange={v => settingsStore.set('autoplayAudio', v)}
      />
      <SettingsRow
        type="toggle"
        icon="TextAa"
        label={t('settings.showWordForms')}
        value={settings.showWordForms}
        onChange={v => settingsStore.set('showWordForms', v)}
      />
      <SettingsRow
        type="toggle"
        icon="ArrowSquareOut"
        label={t('settings.showOrdboken')}
        value={settings.showOrdbokenLink}
        onChange={v => settingsStore.set('showOrdbokenLink', v)}
      />
      <SettingsRow
        type="navigate"
        icon="Lightbulb"
        label={t('settings.spellingHint')}
        value={hintLabel[settings.spellingHintMode]}
        onPress={() =>
          show({
            type: 'picker',
            title: t('settings.spellingHint'),
            options: (Object.keys(hintLabel) as (keyof typeof hintLabel)[]).map(
              value => ({ value, label: hintLabel[value] }),
            ),
            current: settings.spellingHintMode,
            onSelect: v => settingsStore.set('spellingHintMode', v),
            closeLabel: t('common.close'),
          })
        }
      />
    </SettingsGroup>
  );
}
