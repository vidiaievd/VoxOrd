import React from 'react';
import { SettingsGroup, SettingsRow } from '../../../components/ui';
import { useTranslation } from '../../../i18n';

import { formatBuildLabel, readBuildInfo } from '../../../lib/buildInfo';

// Version, build number and commit: what a tester quotes, and what a crash report carries.
const APP_VERSION = formatBuildLabel(readBuildInfo());

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
