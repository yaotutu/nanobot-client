import channelLocales from '@/i18n/channel-locales.json';
import { currentLocale } from '@/i18n';

interface ChannelFieldCopy {
  label?: string;
  placeholder?: string;
  help?: string;
  choices?: Record<string, string>;
}

export interface ChannelLocaleMessages {
  displayName?: string;
  description?: string;
  requirements?: string;
  custom?: Record<string, unknown>;
  setup?: {
    primaryAction?: string;
    docsLabel?: string;
    officialLabel?: string;
    tryIt?: string;
    summary?: string;
    steps?: string[];
    actions?: Record<string, string>;
    presets?: Record<string, string>;
    fields?: Record<string, ChannelFieldCopy>;
  };
}

export function fieldLabel(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : value;
}

export function messageKey(channel: string, key: string): string {
  const prefix = `channels.${channel}.`;
  return (key.startsWith(prefix) ? key.slice(prefix.length) : key).replaceAll(
    ".",
    "_",
  );
}

export function channelMessages(name: string): ChannelLocaleMessages | undefined {
  const locales = channelLocales as Record<
    string,
    Record<string, ChannelLocaleMessages | undefined>
  >;
  return locales[currentLocale()]?.[name] ?? locales.en?.[name];
}

export function ownerName(name: string): string {
  if (name === "lark") return "feishu";
  if (name === "wechat") return "weixin";
  return name;
}

