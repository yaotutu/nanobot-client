export const NANOBOT_DOCS_URL = "https://nanobot.wiki/docs/latest";
export const CHAT_APPS_DOCS_URL = `${NANOBOT_DOCS_URL}/getting-started/chat-apps`;
export interface ChannelDefinition {
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

export const CHANNEL_DEFINITIONS: Record<string, ChannelDefinition> = {
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

