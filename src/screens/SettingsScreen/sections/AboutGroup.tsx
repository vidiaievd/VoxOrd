import React from 'react';
import { SettingsGroup, SettingsRow } from '../../../components/ui';
import { useTranslation } from '../../../i18n';

// Same number the package carries; the native build name is not read at runtime.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const APP_VERSION: string = require('../../../../package.json').version;

/** No help or privacy rows yet: neither has a destination in the app (plan 07 step 2). */
export function AboutGroup() {
  const { t } = useTranslation();
  return (
    <SettingsGroup title={t('settings.about')}>
      <SettingsRow
        isFirst
        type="value"
        icon="Info"
        label={t('settings.version')}
        value={APP_VERSION}
      />
    </SettingsGroup>
  );
}
