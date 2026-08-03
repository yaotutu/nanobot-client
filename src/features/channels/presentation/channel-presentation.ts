import type {
  ChannelSetupContractField,
  NanobotFeatureInfo,
} from '@/types/api/nanobot-features';
import type {
  ChannelConfigField,
  ChannelPresentation,
} from '@/features/channels/presentation/types';

import { CHANNEL_DEFINITIONS, CHAT_APPS_DOCS_URL } from './channel-definitions';
import { channelMessages, fieldLabel, messageKey, ownerName, type ChannelLocaleMessages } from './channel-localization';
import { EMAIL_PROVIDER_PRESETS, SLACK_SOCKET_MODE_MANIFEST } from './channel-setup-assets';

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
