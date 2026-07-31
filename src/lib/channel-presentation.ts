import channelLocales from "@/i18n/channel-locales.json";
import { currentLocale } from "@/i18n";

import type {
  ChannelConfigField,
  ChannelPresentation,
  ChannelSetupContractField,
  NanobotFeatureInfo,
} from "@/types/nanobot";

const NANOBOT_DOCS_URL = "https://nanobot.wiki/docs/latest";
const CHAT_APPS_DOCS_URL = `${NANOBOT_DOCS_URL}/getting-started/chat-apps`;

interface ChannelFieldCopy {
  label?: string;
  placeholder?: string;
  help?: string;
  choices?: Record<string, string>;
}

interface ChannelLocaleMessages {
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

interface ChannelDefinition {
  displayName: string;
  initials: string;
  color: string;
  logoUrl?: string;
  mode: "webui" | "credentials" | "connect";
  command?: string;
  docs: string;
  fields?: string[];
  manualFields?: string[];
  canConnectBeforeConfigured?: boolean;
}

const CHANNEL_DEFINITIONS: Record<string, ChannelDefinition> = {
  dingtalk: {
    displayName: "DingTalk",
    initials: "DT",
    color: "#1677FF",
    logoUrl:
      "https://img.alicdn.com/imgextra/i3/O1CN01WMvMRG1ks3Ixc9x1v_!!6000000004738-55-tps-32-32.svg",
    mode: "credentials",
    docs: "dingtalk",
    fields: [
      "channels.dingtalk.clientId",
      "channels.dingtalk.clientSecret",
      "channels.dingtalk.allowFrom",
    ],
  },
  discord: {
    displayName: "Discord",
    initials: "DC",
    color: "#5865F2",
    logoUrl: "https://discord.com/favicon.ico",
    mode: "credentials",
    docs: "discord",
    fields: [
      "channels.discord.token",
      "channels.discord.allowChannels",
      "channels.discord.groupPolicy",
    ],
  },
  email: {
    displayName: "Email",
    initials: "EM",
    color: "#64748B",
    logoUrl: "https://gmail.com/favicon.ico",
    mode: "credentials",
    docs: "email",
    fields: [
      "channels.email.consentGranted",
      "channels.email.imapHost",
      "channels.email.imapUsername",
      "channels.email.imapPassword",
      "channels.email.smtpHost",
      "channels.email.smtpUsername",
      "channels.email.smtpPassword",
      "channels.email.imapPort",
      "channels.email.smtpPort",
      "channels.email.fromAddress",
      "channels.email.pollIntervalSeconds",
      "channels.email.allowFrom",
      "channels.email.verifyDkim",
      "channels.email.verifySpf",
    ],
  },
  feishu: {
    displayName: "Feishu",
    initials: "FS",
    color: "#3370FF",
    logoUrl: "https://www.feishu.cn/favicon.ico",
    mode: "connect",
    command: "nanobot channels login feishu",
    docs: "feishu",
    manualFields: [
      "channels.feishu.appId",
      "channels.feishu.appSecret",
      "channels.feishu.domain",
      "channels.feishu.groupPolicy",
      "channels.feishu.allowFrom",
    ],
  },
  matrix: {
    displayName: "Matrix",
    initials: "MX",
    color: "#0DBD8B",
    logoUrl: "https://matrix.org/favicon.ico",
    mode: "credentials",
    docs: "matrix",
    fields: [
      "channels.matrix.homeserver",
      "channels.matrix.userId",
      "channels.matrix.password",
      "channels.matrix.accessToken",
      "channels.matrix.deviceId",
      "channels.matrix.groupPolicy",
    ],
  },
  mattermost: {
    displayName: "Mattermost",
    initials: "MM",
    color: "#1C58D9",
    logoUrl: "https://mattermost.com/favicon.ico",
    mode: "credentials",
    docs: "mattermost",
    fields: [
      "channels.mattermost.serverUrl",
      "channels.mattermost.token",
      "channels.mattermost.teamId",
      "channels.mattermost.groupPolicy",
    ],
  },
  msteams: {
    displayName: "Microsoft Teams",
    initials: "MS",
    color: "#6264A7",
    logoUrl: "https://www.microsoft.com/favicon.ico",
    mode: "credentials",
    docs: "msteams",
    fields: [
      "channels.msteams.appId",
      "channels.msteams.appPassword",
      "channels.msteams.tenantId",
      "channels.msteams.path",
      "channels.msteams.allowFrom",
    ],
  },
  napcat: {
    displayName: "NapCat",
    initials: "NC",
    color: "#F97316",
    logoUrl: "https://napneko.github.io/favicon.ico",
    mode: "credentials",
    docs: "napcat",
    fields: [
      "channels.napcat.wsUrl",
      "channels.napcat.accessToken",
      "channels.napcat.groupPolicy",
      "channels.napcat.allowFrom",
    ],
  },
  qq: {
    displayName: "QQ",
    initials: "QQ",
    color: "#12B7F5",
    logoUrl: "https://im.qq.com/favicon.ico",
    mode: "credentials",
    docs: "qq",
    fields: [
      "channels.qq.appId",
      "channels.qq.secret",
      "channels.qq.allowFrom",
      "channels.qq.msgFormat",
    ],
  },
  signal: {
    displayName: "Signal",
    initials: "SG",
    color: "#3A76F0",
    logoUrl: "https://signal.org/favicon.ico",
    mode: "credentials",
    docs: "signal",
    fields: [
      "channels.signal.phoneNumber",
      "channels.signal.daemonHost",
      "channels.signal.daemonPort",
      "channels.signal.dm.allowFrom",
      "channels.signal.group.allowFrom",
    ],
  },
  slack: {
    displayName: "Slack",
    initials: "SL",
    color: "#4A154B",
    logoUrl: "https://slack.com/favicon.ico",
    mode: "credentials",
    docs: "slack",
    fields: [
      "channels.slack.appToken",
      "channels.slack.botToken",
      "channels.slack.groupPolicy",
    ],
  },
  telegram: {
    displayName: "Telegram",
    initials: "TG",
    color: "#229ED9",
    logoUrl: "https://telegram.org/favicon.ico",
    mode: "credentials",
    docs: "telegram",
    fields: [
      "channels.telegram.token",
      "channels.telegram.proxy",
      "channels.telegram.allowFrom",
      "channels.telegram.groupPolicy",
    ],
  },
  websocket: {
    displayName: "WebSocket",
    initials: "WS",
    color: "#111827",
    mode: "webui",
    docs: "websocket",
  },
  wecom: {
    displayName: "WeCom",
    initials: "WC",
    color: "#2F7DFF",
    logoUrl: "https://work.weixin.qq.com/favicon.ico",
    mode: "credentials",
    docs: "wecom",
    fields: [
      "channels.wecom.botId",
      "channels.wecom.secret",
      "channels.wecom.allowFrom",
    ],
  },
  weixin: {
    displayName: "WeChat",
    initials: "WX",
    color: "#07C160",
    logoUrl: "https://weixin.qq.com/favicon.ico",
    mode: "connect",
    command: "nanobot channels login weixin",
    docs: "wechat",
    manualFields: ["channels.weixin.allowFrom", "channels.weixin.token"],
    canConnectBeforeConfigured: true,
  },
  whatsapp: {
    displayName: "WhatsApp",
    initials: "WA",
    color: "#25D366",
    logoUrl: "https://www.whatsapp.com/favicon.ico",
    mode: "connect",
    command: "nanobot channels login whatsapp",
    docs: "whatsapp",
    manualFields: [
      "channels.whatsapp.allowFrom",
      "channels.whatsapp.groupPolicy",
    ],
  },
};

const SLACK_SOCKET_MODE_MANIFEST =
  "display_information:\n  name: nanobot\nfeatures:\n  app_home:\n    home_tab_enabled: false\n    messages_tab_enabled: true\n    messages_tab_read_only_enabled: false\n  bot_user:\n    display_name: nanobot\noauth_config:\n  scopes:\n    bot:\n      - app_mentions:read\n      - channels:history\n      - channels:read\n      - chat:write\n      - files:read\n      - files:write\n      - groups:history\n      - groups:read\n      - im:history\n      - im:write\n      - mpim:history\n      - reactions:write\n      - users:read\nsettings:\n  event_subscriptions:\n    bot_events:\n      - app_mention\n      - message.channels\n      - message.groups\n      - message.im\n      - message.mpim\n  socket_mode_enabled: true\n  interactivity:\n    is_enabled: true";

const EMAIL_PROVIDER_PRESETS: Array<{
  id: string;
  values: Record<string, string>;
}> = [
  {
    id: "gmail",
    values: {
      "channels.email.imapHost": "imap.gmail.com",
      "channels.email.imapPort": "993",
      "channels.email.smtpHost": "smtp.gmail.com",
      "channels.email.smtpPort": "587",
    },
  },
  {
    id: "outlook",
    values: {
      "channels.email.imapHost": "outlook.office365.com",
      "channels.email.imapPort": "993",
      "channels.email.smtpHost": "smtp.office365.com",
      "channels.email.smtpPort": "587",
    },
  },
  {
    id: "icloud",
    values: {
      "channels.email.imapHost": "imap.mail.me.com",
      "channels.email.imapPort": "993",
      "channels.email.smtpHost": "smtp.mail.me.com",
      "channels.email.smtpPort": "587",
    },
  },
  { id: "custom", values: {} },
];

function fieldLabel(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : value;
}

function messageKey(channel: string, key: string): string {
  const prefix = `channels.${channel}.`;
  return (key.startsWith(prefix) ? key.slice(prefix.length) : key).replaceAll(
    ".",
    "_",
  );
}

function channelMessages(name: string): ChannelLocaleMessages | undefined {
  const locales = channelLocales as Record<
    string,
    Record<string, ChannelLocaleMessages | undefined>
  >;
  return locales[currentLocale()]?.[name] ?? locales.en?.[name];
}

function ownerName(name: string): string {
  if (name === "lark") return "feishu";
  if (name === "wechat") return "weixin";
  return name;
}

function contractField(
  channel: string,
  field: ChannelSetupContractField,
  locale: ChannelLocaleMessages | undefined,
): ChannelConfigField {
  const copy = locale?.setup?.fields?.[messageKey(channel, field.key)];
  const choices = field.kind === "bool" ? ["true", "false"] : field.choices;
  return {
    key: field.key,
    label: copy?.label ?? fieldLabel(field.key.split(".").at(-1) ?? field.key),
    placeholder: copy?.placeholder,
    help: copy?.help,
    secret: field.kind === "secret",
    optional: !field.required,
    inputType: field.kind === "int" ? "number" : undefined,
    defaultValue: field.default_value,
    options:
      field.kind === "enum" || field.kind === "bool"
        ? choices.map((choice) => ({
            value: choice,
            label: copy?.choices?.[choice] ?? fieldLabel(choice),
          }))
        : undefined,
  };
}

export function channelPresentation(
  feature: NanobotFeatureInfo,
): ChannelPresentation {
  const owner = ownerName(feature.name);
  const definition = CHANNEL_DEFINITIONS[owner];
  const locale = channelMessages(owner);
  const fallbackDisplayName = feature.display_name || fieldLabel(feature.name);
  const baseDisplayName =
    locale?.displayName ?? definition?.displayName ?? fallbackDisplayName;
  const displayName = feature.name === "lark" ? "Lark" : baseDisplayName;
  const fields = feature.setup?.fields ?? [];
  const manualKeys = new Set(definition?.manualFields ?? []);
  const authoritativeFields = fields.map((field) =>
    contractField(owner, field, locale),
  );
  const primaryFields = authoritativeFields.filter(
    (field) => !manualKeys.has(field.key),
  );
  const manualFields = authoritativeFields.filter((field) =>
    manualKeys.has(field.key),
  );
  const setupMessages = locale?.setup;
  const docsUrl = definition?.docs
    ? `${CHAT_APPS_DOCS_URL}#${definition.docs}`
    : undefined;
  const defaultSteps = [
    `Open ~/.nanobot/config.json and find channels.${feature.name}.`,
    "Add the credentials required by that platform, using the channel documentation as the source of truth.",
    "Restart nanobot, then send a small test message from that platform.",
  ];
  const presets =
    owner === "email"
      ? EMAIL_PROVIDER_PRESETS.map((preset) => ({
          ...preset,
          label: setupMessages?.presets?.[preset.id] ?? fieldLabel(preset.id),
        }))
      : undefined;
  const actions =
    owner === "slack"
      ? [
          {
            id: "slack-manifest",
            label:
              setupMessages?.actions?.["slack-manifest"] ?? "Copy manifest",
            copyText: SLACK_SOCKET_MODE_MANIFEST,
            logoUrl: "https://slack.com/favicon.ico",
          },
        ]
      : undefined;

  return {
    displayName,
    initials:
      feature.name === "lark"
        ? "LK"
        : (definition?.initials ?? displayName.slice(0, 2).toUpperCase()),
    color: definition?.color ?? "#6B7280",
    logoUrl:
      feature.name === "lark"
        ? "https://www.larksuite.com/favicon.ico"
        : definition?.logoUrl,
    description: locale?.description,
    requirements: locale?.requirements,
    canConnectBeforeConfigured: definition?.canConnectBeforeConfigured,
    setup: {
      mode: definition?.mode ?? "credentials",
      primaryActionLabel: setupMessages?.primaryAction,
      command: definition?.command,
      docsUrl,
      docsLabel: setupMessages?.docsLabel,
      officialUrl: feature.setup?.official_url,
      officialLabel:
        setupMessages?.officialLabel ??
        (feature.setup?.official_url ? "Open official setup" : undefined),
      summary:
        setupMessages?.summary ??
        "Enable turns on this channel in nanobot, but this integration still needs platform-specific setup before it can receive messages.",
      tryIt: setupMessages?.tryIt,
      steps: setupMessages?.steps ?? defaultSteps,
      fields: primaryFields.length ? primaryFields : undefined,
      manualFields: manualFields.length ? manualFields : undefined,
      actions,
      presets,
    },
  };
}
