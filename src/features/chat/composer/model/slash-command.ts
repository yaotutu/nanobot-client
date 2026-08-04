import type {
  SlashCommand,
  SlashCommandLifecycle,
} from '@/types/api/chat/commands';

export type ResolvedSlashCommandLifecycle = Exclude<
  SlashCommandLifecycle,
  'agent_turn_with_args'
>;

function commandName(content: string): string {
  return content.trimStart().split(/\s+/, 1)[0] ?? '';
}

function commandArgs(content: string, name: string): string {
  return content.trimStart().slice(name.length).trim();
}

export function matchingSlashCommand(
  content: string,
  commands: SlashCommand[],
): SlashCommand | null {
  const name = commandName(content);
  if (!name.startsWith('/')) return null;
  const match = commands.find((command) => command.command === name);
  if (!match) return null;
  if (commandArgs(content, match.command) && !match.acceptsArgs) return null;
  return match;
}

export function slashCommandLifecycle(
  content: string,
  commands: SlashCommand[],
): ResolvedSlashCommandLifecycle | null {
  const match = matchingSlashCommand(content, commands);
  if (!match) return null;
  if (match.lifecycle === 'agent_turn_with_args') {
    return commandArgs(content, match.command) ? 'agent_turn' : 'side_channel';
  }
  return match.lifecycle;
}

export function isSideChannelLifecycle(
  lifecycle: ResolvedSlashCommandLifecycle | null,
): boolean {
  return lifecycle === 'side_channel' ||
    lifecycle === 'finalize_active_turn' ||
    lifecycle === 'stop_active_turn';
}

export function slashQuery(content: string): string | null {
  if (!content.startsWith('/')) return null;
  const token = content.slice(1);
  if (/\s/.test(token)) return null;
  return token.toLowerCase();
}
