import type { TFunction } from 'i18next';

import type { ChannelConnectPayload } from '@/types/api/channels';

import { channelCopy } from './channel-copy';

export function channelConnectInstruction(name: string, t: TFunction): string {
  if (name === 'weixin') {
    return channelCopy(t, 'connectInstructions.weixin', 'Scan the QR code with WeChat. After sign-in, the account state is stored securely on the nanobot server.');
  }
  if (name === 'feishu') {
    return channelCopy(t, 'connectInstructions.feishu', 'Scan the QR code with Feishu or Lark and finish authorization on your phone.');
  }
  if (name === 'whatsapp') {
    return channelCopy(t, 'connectInstructions.whatsapp', 'Scan the QR code with WhatsApp and wait for the connection to finish.');
  }
  return channelCopy(t, 'connectInstructions.default', 'Scan the QR code with the corresponding mobile app and wait for the connection to finish.');
}

export function channelConnectStatusLabel(
  connect: ChannelConnectPayload | null,
  t: TFunction,
): string | null {
  if (!connect) return null;
  if (connect.message?.trim()) return connect.message.trim();
  if (connect.status === 'pending') return channelCopy(t, 'connectStatus.pending', 'Waiting for scan or authorization…');
  if (connect.status === 'succeeded') return channelCopy(t, 'connectStatus.succeeded', 'Connected.');
  if (connect.status === 'expired') return channelCopy(t, 'connectStatus.expired', 'The QR code expired. Generate a new one.');
  if (connect.status === 'cancelled') return channelCopy(t, 'connectStatus.cancelled', 'Connection cancelled.');
  if (connect.status === 'failed') return channelCopy(t, 'connectStatus.failed', 'Connection failed. Try again.');
  return connect.status;
}
