export const SLACK_SOCKET_MODE_MANIFEST =
  "display_information:\n  name: nanobot\nfeatures:\n  app_home:\n    home_tab_enabled: false\n    messages_tab_enabled: true\n    messages_tab_read_only_enabled: false\n  bot_user:\n    display_name: nanobot\noauth_config:\n  scopes:\n    bot:\n      - app_mentions:read\n      - channels:history\n      - channels:read\n      - chat:write\n      - files:read\n      - files:write\n      - groups:history\n      - groups:read\n      - im:history\n      - im:write\n      - mpim:history\n      - reactions:write\n      - users:read\nsettings:\n  event_subscriptions:\n    bot_events:\n      - app_mention\n      - message.channels\n      - message.groups\n      - message.im\n      - message.mpim\n  socket_mode_enabled: true\n  interactivity:\n    is_enabled: true";

export const EMAIL_PROVIDER_PRESETS: Array<{
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

