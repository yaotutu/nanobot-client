import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type {
  UICliAppAttachment,
  UIMcpPresetAttachment,
} from '@/types/api/chat/media';

export interface CapabilityMentionQuery {
  query: string;
  start: number;
  end: number;
}

export type CapabilityMentionCandidate =
  | { kind: 'cli'; name: string; app: CliAppInfo }
  | { kind: 'mcp'; name: string; preset: McpPresetInfo };

export function capabilityMentionQuery(
  value: string,
  cursorPosition: number,
): CapabilityMentionQuery | null {
  const caret = Math.min(Math.max(cursorPosition, 0), value.length);
  const beforeCaret = value.slice(0, caret);
  const match = /(?:^|\s)@([a-z0-9_-]*)$/i.exec(beforeCaret);
  if (!match) return null;
  const query = match[1].toLowerCase();
  return {
    query,
    start: caret - query.length - 1,
    end: caret,
  };
}

export function capabilityMentionCandidates(
  query: CapabilityMentionQuery | null,
  cliApps: CliAppInfo[],
  mcpPresets: McpPresetInfo[],
): CapabilityMentionCandidate[] {
  if (!query) return [];
  const cliCandidates: CapabilityMentionCandidate[] = cliApps
    .filter((app) => app.installed)
    .filter((app) => [
      app.name,
      app.display_name,
      app.category,
      app.description,
      app.entry_point,
    ].join(' ').toLowerCase().includes(query.query))
    .map((app) => ({ kind: 'cli', name: app.name, app }));
  const mcpCandidates: CapabilityMentionCandidate[] = mcpPresets
    .filter((preset) => preset.installed && preset.configured)
    .filter((preset) => [
      preset.name,
      preset.display_name,
      preset.category,
      preset.description,
      preset.transport,
    ].join(' ').toLowerCase().includes(query.query))
    .map((preset) => ({ kind: 'mcp', name: preset.name, preset }));
  return [...cliCandidates, ...mcpCandidates].slice(0, 8);
}

export function insertCapabilityMention(
  value: string,
  query: CapabilityMentionQuery,
  candidate: CapabilityMentionCandidate,
): { value: string; cursor: number } {
  const suffix = value.slice(query.end);
  const mention = `@${candidate.name}${suffix.startsWith(' ') ? '' : ' '}`;
  return {
    value: `${value.slice(0, query.start)}${mention}${suffix}`,
    cursor: query.start + mention.length,
  };
}

function cliPayload(app: CliAppInfo): UICliAppAttachment {
  return {
    name: app.name,
    display_name: app.display_name,
    category: app.category,
    entry_point: app.entry_point,
    logo_url: app.logo_url ?? null,
    brand_color: app.brand_color ?? null,
  };
}

function mcpPayload(preset: McpPresetInfo): UIMcpPresetAttachment {
  return {
    name: preset.name,
    display_name: preset.display_name,
    category: preset.category,
    transport: preset.transport,
    status: preset.status,
    configured: preset.configured,
    logo_url: preset.logo_url ?? null,
    brand_color: preset.brand_color ?? null,
  };
}

export function activeCapabilityMentionPayloads(
  value: string,
  cliApps: CliAppInfo[],
  mcpPresets: McpPresetInfo[],
): { cliApps: UICliAppAttachment[]; mcpPresets: UIMcpPresetAttachment[] } {
  const cliByName = new Map(
    cliApps.filter((app) => app.installed).map((app) => [app.name.toLowerCase(), app]),
  );
  const mcpByName = new Map(
    mcpPresets
      .filter((preset) => preset.installed && preset.configured)
      .map((preset) => [preset.name.toLowerCase(), preset]),
  );
  const cliMentions: UICliAppAttachment[] = [];
  const mcpMentions: UIMcpPresetAttachment[] = [];
  const seenCli = new Set<string>();
  const seenMcp = new Set<string>();
  const mentionRe = /(^|[\s([{])@([a-z0-9_-]+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = mentionRe.exec(value)) !== null) {
    const key = (match[2] ?? '').toLowerCase();
    const app = cliByName.get(key);
    if (app && !seenCli.has(key)) {
      seenCli.add(key);
      cliMentions.push(cliPayload(app));
      continue;
    }
    const preset = mcpByName.get(key);
    if (preset && !seenMcp.has(key)) {
      seenMcp.add(key);
      mcpMentions.push(mcpPayload(preset));
    }
  }
  return { cliApps: cliMentions, mcpPresets: mcpMentions };
}
