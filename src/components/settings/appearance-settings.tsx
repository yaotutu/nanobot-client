import { useTranslation } from 'react-i18next';

import { supportedLocales, type SupportedLocale } from '@/i18n/config';
import type { LocalPreferences } from '@/stores/local-preferences-store';

import type { SettingsPalette } from '../screens/settings-screen';
import {
  SegmentedControl,
  SettingsPage,
  SettingsPicker,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from './settings-controls';

export function AppearanceSettings({ colors, preferences, onChange }: {
  colors: SettingsPalette;
  preferences: LocalPreferences;
  onChange: (preferences: LocalPreferences) => void;
}) {
  const { t } = useTranslation();
  const patch = (next: Partial<LocalPreferences>) => onChange({ ...preferences, ...next });
  const languageOptions = supportedLocales.map((locale) => ({
    value: locale.code,
    label: locale.nativeLabel,
    description: locale.nativeLabel === locale.label ? undefined : locale.label,
  }));

  return (
    <SettingsPage>
      <SettingsSection colors={colors} title={t('settings.sections.interface')}>
        <SettingsRow
          colors={colors}
          title={t('settings.rows.theme')}
          description={t('settings.help.theme')}
        >
          <SegmentedControl
            colors={colors}
            onChange={(theme) => patch({ theme: theme === 'dark' ? 'dark' : 'light' })}
            options={[
              { value: 'light', label: t('settings.values.light') },
              { value: 'dark', label: t('settings.values.dark') },
            ]}
            value={preferences.theme}
          />
        </SettingsRow>
        <SettingsRow
          colors={colors}
          last
          title={t('settings.rows.language')}
          description={t('settings.help.language')}
        >
          <SettingsPicker
            colors={colors}
            label={t('sidebar.language.ariaLabel')}
            onChange={(language) => patch({ language: language as SupportedLocale })}
            options={languageOptions}
            title={t('sidebar.language.label')}
            value={preferences.language}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection colors={colors} title={t('settings.sections.localPreferences')}>
        <SettingsRow
          colors={colors}
          title={t('settings.rows.density')}
          description={t('settings.help.density')}
        >
          <SegmentedControl
            colors={colors}
            onChange={(density) => patch({ density: density === 'compact' ? 'compact' : 'comfortable' })}
            options={[
              { value: 'comfortable', label: t('settings.values.comfortable') },
              { value: 'compact', label: t('settings.values.compact') },
            ]}
            value={preferences.density}
          />
        </SettingsRow>
        <SettingsRow
          colors={colors}
          title={t('settings.rows.activityMode')}
          description={t('settings.help.activityMode')}
        >
          <SegmentedControl
            colors={colors}
            onChange={(activityMode) => patch({ activityMode: activityMode === 'expanded' ? 'expanded' : 'auto' })}
            options={[
              { value: 'auto', label: t('settings.values.auto') },
              { value: 'expanded', label: t('settings.values.expanded') },
            ]}
            value={preferences.activityMode}
          />
        </SettingsRow>
        <SettingsRow
          colors={colors}
          title={t('settings.rows.fileEditDisplay')}
          description={t('settings.help.fileEditDisplay')}
        >
          <SegmentedControl
            colors={colors}
            onChange={(mode) => patch({
              fileEditDisplayMode: mode === 'diff' || mode === 'collapsed_diff' ? mode : 'summary',
            })}
            options={[
              { value: 'summary', label: t('settings.values.summary') },
              { value: 'diff', label: t('settings.values.diff') },
              { value: 'collapsed_diff', label: t('settings.values.collapsedDiff') },
            ]}
            value={preferences.fileEditDisplayMode}
          />
        </SettingsRow>
        <SettingsRow
          colors={colors}
          title={t('settings.rows.codeWrap')}
          description={t('settings.help.codeWrap')}
        >
          <SettingsSwitch
            colors={colors}
            onValueChange={(codeWrap) => patch({ codeWrap })}
            value={preferences.codeWrap}
          />
        </SettingsRow>
        <SettingsRow
          colors={colors}
          last
          title={t('settings.rows.brandLogos')}
          description={t('settings.help.brandLogos')}
        >
          <SettingsSwitch
            colors={colors}
            onValueChange={(brandLogos) => patch({ brandLogos })}
            value={preferences.brandLogos}
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}
