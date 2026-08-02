import { Text, StyleSheet } from 'react-native';

import { matchingSlashCommand } from '@/features/chat/slash-command';
import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type {
  SlashCommand,
  UIMessage,
} from '@/types/api/chat';
import type { Palette } from '@/ui/palette';

interface UserMessageBodyProps {
  cliApps: CliAppInfo[];
  colors: Palette;
  content: string;
  mcpPresets: McpPresetInfo[];
  message: UIMessage;
  slashCommands: SlashCommand[];
}

export function UserMessageBody({
  cliApps,
  colors,
  content,
  mcpPresets,
  message,
  slashCommands,
}: UserMessageBodyProps) {
  const command = matchingSlashCommand(content, slashCommands);
  const attachedCliNames = new Set((message.cliApps ?? []).map((item) => item.name.toLowerCase()));
  const attachedMcpNames = new Set((message.mcpPresets ?? []).map((item) => item.name.toLowerCase()));
  const cliByName = new Map(cliApps.map((item) => [item.name.toLowerCase(), item]));
  const mcpByName = new Map(mcpPresets.map((item) => [item.name.toLowerCase(), item]));
  const tokenPattern = /(^|[\s([{])(\$[A-Za-z0-9_-]+|@[A-Za-z0-9_-]+)|(^\/[^\s]+)/g;
  const segments: Array<{ text: string; tone?: string }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(content)) !== null) {
    const raw = match[2] || match[3] || '';
    const tokenStart = match.index + (match[1]?.length ?? 0);
    if (tokenStart > cursor) segments.push({ text: content.slice(cursor, tokenStart) });
    let tone: string | undefined;
    if (raw.startsWith('$')) tone = '#6D5DF6';
    if (raw.startsWith('/')) tone = command?.command === raw ? '#6D5DF6' : undefined;
    if (raw.startsWith('@')) {
      const name = raw.slice(1).toLowerCase();
      const cli = cliByName.get(name);
      const mcp = mcpByName.get(name);
      if (cli?.installed || attachedCliNames.has(name)) tone = cli?.brand_color || '#0891B2';
      else if ((mcp?.installed && mcp.configured) || attachedMcpNames.has(name)) {
        tone = mcp?.brand_color || '#6D5DF6';
      }
    }
    segments.push({ text: raw, tone });
    cursor = tokenStart + raw.length;
  }
  if (cursor < content.length) segments.push({ text: content.slice(cursor) });
  if (!segments.length) segments.push({ text: content });

  return (
    <Text selectable style={[styles.messageText, { color: colors.userText }]}>
      {segments.map((segment, index) => segment.tone ? (
        <Text
          key={`${segment.text}-${index}`}
          style={[
            styles.inlineToken,
            { color: segment.tone, backgroundColor: translucentTokenColor(segment.tone) },
          ]}
        >
          {segment.text}
        </Text>
      ) : <Text key={`${segment.text}-${index}`}>{segment.text}</Text>)}
    </Text>
  );
}

function translucentTokenColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}1F` : 'rgba(109,93,246,0.12)';
}

const styles = StyleSheet.create({
  messageText: { fontSize: 15.5, lineHeight: 23 },
  inlineToken: { fontWeight: '600', borderRadius: 4 },
});
