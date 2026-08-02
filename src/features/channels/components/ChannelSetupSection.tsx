import { Check, ClipboardCopy } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ActionButton, Section } from '@/features/channels/components/channel-controls';
import { channelCopy } from '@/features/channels/components/channels-utils';
import type { ChannelSetupMode, ChannelSetupPresentation } from '@/types/api/channels';
import type { SettingsPalette } from '@/features/settings/types';

interface ChannelSetupSectionProps {
  colors: SettingsPalette;
  configured?: boolean;
  mode: ChannelSetupMode;
  notice: string | null;
  onCopy: (value: string, successMessage: string) => Promise<void>;
  onOpenUrl: (url: string) => Promise<void>;
  requirements?: string;
  setup: ChannelSetupPresentation;
}

export function ChannelSetupSection(props: ChannelSetupSectionProps) {
  const { t } = useTranslation();
  const { colors, mode, setup } = props;
  return (
    <Section colors={colors} title={channelCopy(t, 'requiredSetup', 'Required setup')}>
      <View style={styles.setupHeadingRow}>
        <Text style={[styles.setupHeading, { color: colors.foreground }]}>
          {mode === 'webui'
            ? channelCopy(t, 'managedByWebui', 'Managed by WebUI')
            : channelCopy(t, 'channelConfiguration', 'Channel configuration')}
        </Text>
        <View style={[
          styles.setupModeBadge,
          { backgroundColor: mode === 'webui' ? '#E6F5EE' : colors.background },
        ]}>
          {mode === 'webui' ? <Check color="#16865C" size={13} /> : null}
          <Text style={[
            styles.setupModeText,
            { color: mode === 'webui' ? '#16865C' : colors.muted },
          ]}>
            {mode === 'webui'
              ? channelCopy(t, 'managedByWebui', 'Managed by WebUI')
              : props.configured
                ? channelCopy(t, 'instanceConfigured', 'Configured')
                : channelCopy(t, 'needsConfig', 'Needs setup')}
          </Text>
        </View>
      </View>
      {props.requirements ? (
        <Text style={[styles.helper, { color: colors.muted }]}>{props.requirements}</Text>
      ) : null}
      {setup.summary ? (
        <Text style={[styles.helper, { color: colors.muted }]}>{setup.summary}</Text>
      ) : null}
      <View style={styles.actionRow}>
        {setup.docsUrl ? (
          <ActionButton
            colors={colors}
            label={setup.docsLabel ?? channelCopy(t, 'setupGuide', 'Setup guide')}
            onPress={() => void props.onOpenUrl(setup.docsUrl!)}
          />
        ) : null}
        {setup.officialUrl ? (
          <ActionButton
            colors={colors}
            label={setup.officialLabel ?? channelCopy(t, 'officialGuide', 'Official guide')}
            onPress={() => void props.onOpenUrl(setup.officialUrl!)}
          />
        ) : null}
        {setup.actions?.map((action) => (
          <ActionButton
            colors={colors}
            key={action.id}
            label={action.label}
            onPress={() => {
              if (action.copyText) {
                void props.onCopy(
                  action.copyText,
                  channelCopy(t, 'helperCopied', '{{name}} copied.', { name: action.label }),
                );
              } else if (action.url) {
                void props.onOpenUrl(action.url);
              }
            }}
          />
        ))}
      </View>
      {setup.command ? (
        <View style={[
          styles.commandBox,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}>
          <Text selectable style={[styles.commandText, { color: colors.foreground }]}>
            {setup.command}
          </Text>
          <Pressable
            accessibilityLabel={channelCopy(t, 'copyCommand', 'Copy command')}
            onPress={() => void props.onCopy(
              setup.command!,
              channelCopy(t, 'commandCopied', 'Command copied.'),
            )}
            style={styles.commandCopy}
          >
            <ClipboardCopy color={colors.muted} size={16} />
          </Pressable>
        </View>
      ) : null}
      {props.notice ? (
        <Text style={[styles.notice, { color: colors.muted }]}>{props.notice}</Text>
      ) : null}
    </Section>
  );
}

export function ChannelNextStepsSection({
  colors,
  setup,
}: {
  colors: SettingsPalette;
  setup: ChannelSetupPresentation;
}) {
  const { t } = useTranslation();
  if (!setup.steps.length) return null;
  return (
    <Section colors={colors} title={channelCopy(t, 'setupSteps', 'Next steps')}>
      <View style={styles.stepsList}>
        {setup.steps.map((step, index) => (
          <View key={`${index}:${step}`} style={styles.stepRow}>
            <View style={[styles.stepNumber, { backgroundColor: colors.background }]}>
              <Text style={[styles.stepNumberText, { color: colors.muted }]}>{index + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: colors.muted }]}>{step}</Text>
          </View>
        ))}
      </View>
      {setup.tryIt ? (
        <View style={[
          styles.tryItBox,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}>
          <Text style={[styles.tryItTitle, { color: colors.foreground }]}>
            {channelCopy(t, 'tryIt', 'Try it')}
          </Text>
          <Text style={[styles.tryItText, { color: colors.muted }]}>{setup.tryIt}</Text>
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  helper: { fontSize: 12.5, lineHeight: 19 },
  setupHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  setupHeading: { flex: 1, fontSize: 13, fontWeight: '700' },
  setupModeBadge: { minHeight: 26, borderRadius: 13, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  setupModeText: { fontSize: 10.5, fontWeight: '700' },
  commandBox: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingLeft: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  commandText: { flex: 1, paddingVertical: 9, fontSize: 11, lineHeight: 17, fontFamily: 'monospace' },
  commandCopy: { width: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { fontSize: 12.5, lineHeight: 18 },
  stepsList: { gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  stepNumber: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 10, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 12.5, lineHeight: 19 },
  tryItBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 11, gap: 4 },
  tryItTitle: { fontSize: 12, fontWeight: '700' },
  tryItText: { fontSize: 12, lineHeight: 18 },
});
