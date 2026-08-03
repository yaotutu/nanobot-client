import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { SettingsPage } from './settings-controls';
import type { ModelsSettingsProps } from '@/features/settings/model/models-utils';
import { PresetsSection } from './models/PresetsSection';
import { ProvidersSection } from './models/ProvidersSection';

export function ModelsSettings(props: ModelsSettingsProps) {
  const { t } = useTranslation();
  return (
    <SettingsPage>
      <PresetsSection {...props} />
      <ProvidersSection {...props} />
      <View style={styles.legalNote}>
        <Text style={[styles.helpText, { color: props.colors.subtle }]}>{t('settings.legal.thirdPartyBrands')}</Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  helpText: { fontSize: 11.5, lineHeight: 17 },
  legalNote: { paddingHorizontal: 5 },
});
