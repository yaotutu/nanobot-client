import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-native-qrcode-svg';

import { ActionButton, Section } from '@/features/channels/components/channel-controls';
import {
  channelConnectInstruction,
  channelConnectStatusLabel,
  channelCopy,
} from '@/features/channels/model';
import type { ChannelConnectPayload } from '@/types/api/channels';
import type { ChannelConnectMode } from '@/features/channels/hooks/use-channel-connect';
import type { Palette } from '@/ui/palette';

interface ChannelConnectSectionProps {
  busy: boolean;
  channelName: string;
  connect: ChannelConnectPayload | null;
  hasInstancePanel: boolean;
  instanceConfigured: boolean;
  mode: ChannelConnectMode;
  onBegin: (mode?: ChannelConnectMode) => Promise<void>;
  onCancel: () => Promise<void>;
  supportsConnect: boolean;
  colors: Palette;
}

export function ChannelConnectSection(props: ChannelConnectSectionProps) {
  const { t } = useTranslation();
  const { colors, connect } = props;
  const showPrimary = props.supportsConnect
    && (props.channelName !== 'feishu' || !props.instanceConfigured || connect);
  return (
    <>
      {showPrimary ? (
        <Section
          colors={colors}
          title={props.mode === 'create'
            ? channelCopy(t, 'createAssistant', 'Create assistant')
            : channelCopy(t, 'connect', 'Connect')}
        >
          <Text style={[styles.helper, { color: colors.muted }]}>
            {props.mode === 'create'
              ? channelCopy(
                  t,
                  'createAssistantInstruction',
                  'Scan the QR code with Feishu or Lark to create an independent assistant for another team, space, or workflow.',
                )
              : channelConnectInstruction(props.channelName, t)}
          </Text>
          {connect?.qr_url ? (
            <View
              accessibilityLabel={channelCopy(t, 'loginQrCode', 'Channel sign-in QR code')}
              accessible
              style={[styles.qrFrame, { backgroundColor: '#FFFFFF', borderColor: colors.border }]}
            >
              <QRCode backgroundColor="#FFFFFF" color="#111827" quietZone={8} size={210} value={connect.qr_url} />
            </View>
          ) : null}
          {channelConnectStatusLabel(connect, t) ? (
            <Text style={[styles.notice, { color: colors.muted }]}>
              {channelConnectStatusLabel(connect, t)}
            </Text>
          ) : null}
          <View style={styles.actionRow}>
            <ActionButton
              colors={colors}
              disabled={connect?.status === 'pending' || props.busy}
              label={props.busy
                ? channelCopy(t, 'processing', 'Processing…')
                : connect?.status === 'pending'
                  ? channelCopy(t, 'connecting', 'Connecting…')
                  : connect?.status === 'succeeded'
                    ? props.mode === 'create'
                      ? channelCopy(t, 'createAnother', 'Create another')
                      : channelCopy(t, 'scanAgain', 'Scan again')
                    : props.mode === 'create'
                      ? channelCopy(t, 'createAssistant', 'Create assistant')
                      : channelCopy(t, 'startConnection', 'Start connection')}
              onPress={() => void props.onBegin(props.mode)}
              primary
            />
            {connect?.status === 'pending' ? (
              <ActionButton
                colors={colors}
                disabled={props.busy}
                label={props.busy
                  ? channelCopy(t, 'cancelling', 'Cancelling…')
                  : channelCopy(t, 'cancel', 'Cancel')}
                onPress={() => void props.onCancel()}
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      {props.channelName === 'feishu' && props.hasInstancePanel ? (
        <Section colors={colors} title={channelCopy(t, 'createAnotherAssistant', 'Create another assistant')}>
          <Text style={[styles.helper, { color: colors.muted }]}>
            {channelCopy(
              t,
              'createAnotherAssistantDescription',
              'Create an independent Feishu bot assistant for another team, space, or workflow.',
            )}
          </Text>
          <View style={styles.actionRow}>
            <ActionButton
              colors={colors}
              disabled={props.busy || connect?.status === 'pending'}
              label={props.mode === 'create' && props.busy
                ? channelCopy(t, 'creating', 'Creating…')
                : channelCopy(t, 'createAssistant', 'Create assistant')}
              onPress={() => void props.onBegin('create')}
              primary
            />
          </View>
        </Section>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  helper: { fontSize: 12.5, lineHeight: 19 },
  qrFrame: { alignSelf: 'center', width: 230, height: 230, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  notice: { fontSize: 12.5, lineHeight: 18 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
