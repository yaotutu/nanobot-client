import ChevronDown from 'lucide-react-native/icons/chevron-down';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChannelFields } from '@/features/channels/components/ChannelFields';
import { ActionButton, Section } from '@/features/channels/components/channel-controls';
import { channelCopy } from '@/features/channels/model';
import type {
  ChannelConfigField,
  ChannelProviderPreset,
  ChannelSetupMode,
} from '@/features/channels/presentation/types';
import type { ChannelValidationPayload } from '@/types/api/channels';
import type { Palette } from '@/ui/palette';

interface ChannelConfigurationSectionProps {
  advancedFields: ChannelConfigField[];
  advancedOpen: boolean;
  busy: boolean;
  colors: Palette;
  configured: boolean;
  configuredFields: Set<string>;
  mode: ChannelSetupMode;
  onApplyPreset: (values: Record<string, string>, label: string) => void;
  onChange: (key: string, value: string) => void;
  onCheckAndEnable: () => Promise<void>;
  onSave: () => Promise<void>;
  onToggleAdvanced: () => void;
  onToggleSecret: (key: string) => void;
  onValidate: () => Promise<void>;
  presets?: ChannelProviderPreset[];
  primaryFields: ChannelConfigField[];
  running: boolean;
  saving: boolean;
  supportsConnect: boolean;
  touched: Set<string>;
  validating: boolean;
  validation: ChannelValidationPayload | null;
  values: Record<string, string>;
  visibleSecrets: Set<string>;
}

export function ChannelConfigurationSection(props: ChannelConfigurationSectionProps) {
  const { t } = useTranslation();
  const { colors } = props;
  if (props.mode === 'webui') return null;
  return (
    <Section colors={colors} title={channelCopy(t, 'configuration', 'Configuration')}>
      {props.presets?.length ? (
        <View style={styles.presetRow}>
          {props.presets.map((preset) => (
            <Pressable
              accessibilityRole="radio"
              key={preset.id}
              onPress={() => props.onApplyPreset(preset.values, preset.label)}
              style={[styles.presetButton, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.presetText, { color: colors.foreground }]}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {props.primaryFields.length ? (
        <ChannelFields
          colors={colors}
          configuredFields={props.configuredFields}
          fields={props.primaryFields}
          onChange={props.onChange}
          onToggleSecret={props.onToggleSecret}
          touched={props.touched}
          values={props.values}
          visibleSecrets={props.visibleSecrets}
        />
      ) : props.mode === 'credentials' ? (
        <Text style={[styles.helper, { color: colors.muted }]}>
          {channelCopy(
            t,
            'noCredentialFields',
            'This channel has no editable credential fields. Follow the documentation to finish external setup.',
          )}
        </Text>
      ) : (
        <Text style={[styles.helper, { color: colors.muted }]}>
          {channelCopy(
            t,
            'connectSavesCredentials',
            'QR connection saves the primary credentials automatically. Manual fields are available under Advanced.',
          )}
        </Text>
      )}
      <View style={styles.actionRow}>
        {props.supportsConnect ? (
          <>
            <ActionButton
              colors={colors}
              disabled={props.busy || props.touched.size === 0}
              label={props.saving
                ? channelCopy(t, 'saving', 'Saving…')
                : channelCopy(t, 'saveManualSettings', 'Save manual settings')}
              onPress={() => void props.onSave()}
              primary
            />
            <ActionButton
              colors={colors}
              disabled={props.busy}
              label={props.validating
                ? channelCopy(t, 'validating', 'Validating…')
                : channelCopy(t, 'validate', 'Validate')}
              onPress={() => void props.onValidate()}
            />
          </>
        ) : (
          <>
            <ActionButton
              colors={colors}
              disabled={props.busy}
              label={props.saving || props.validating
                ? channelCopy(t, 'checking', 'Checking...')
                : props.running
                  ? channelCopy(t, 'checkConnection', 'Check connection')
                  : channelCopy(t, 'checkAndEnable', 'Check and enable')}
              onPress={() => void props.onCheckAndEnable()}
              primary
            />
            {props.configured || props.validation ? (
              <ActionButton
                colors={colors}
                disabled={props.busy}
                label={props.validating
                  ? channelCopy(t, 'checking', 'Checking...')
                  : channelCopy(t, 'checkOnly', 'Check only')}
                onPress={() => void props.onValidate()}
              />
            ) : null}
          </>
        )}
      </View>
      {props.advancedFields.length ? (
        <View style={[styles.advancedWrap, { borderTopColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: props.advancedOpen }}
            onPress={props.onToggleAdvanced}
            style={styles.advancedHeader}
          >
            <Text style={[styles.advancedTitle, { color: colors.foreground }]}>
              {channelCopy(t, 'advanced', 'Advanced')}
            </Text>
            <ChevronDown
              color={colors.muted}
              size={16}
              style={{ transform: [{ rotate: props.advancedOpen ? '180deg' : '0deg' }] }}
            />
          </Pressable>
          {props.advancedOpen ? (
            <ChannelFields
              colors={colors}
              configuredFields={props.configuredFields}
              fields={props.advancedFields}
              onChange={props.onChange}
              onToggleSecret={props.onToggleSecret}
              touched={props.touched}
              values={props.values}
              visibleSecrets={props.visibleSecrets}
            />
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  helper: { fontSize: 12.5, lineHeight: 19 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  presetButton: { minHeight: 34, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  presetText: { fontSize: 11.5, fontWeight: '700' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  advancedWrap: { marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  advancedHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  advancedTitle: { fontSize: 12.5, fontWeight: '700' },
});
