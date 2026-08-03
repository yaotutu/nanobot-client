import type { WorkspaceScopePayload } from '../workspaces';
import type {
  OutboundMedia,
  UICliAppAttachment,
  UIMcpPresetAttachment,
  UIMediaAttachment,
} from './media';

export interface SendAttachment {
  media: OutboundMedia;
  preview: UIMediaAttachment;
}

export type SlashCommandLifecycle =
  | 'side_channel'
  | 'finalize_active_turn'
  | 'stop_active_turn'
  | 'agent_turn'
  | 'agent_turn_with_args';

export interface SlashCommand {
  command: string;
  title: string;
  description: string;
  icon: string;
  argHint: string;
  lifecycle: SlashCommandLifecycle;
  acceptsArgs: boolean;
}

export interface SendMessageOptions {
  cliApps?: UICliAppAttachment[];
  mcpPresets?: UIMcpPresetAttachment[];
  quotedContext?: string;
  workspaceScope?: WorkspaceScopePayload | null;
  sideChannel?: boolean;
  finalizeActiveTurn?: boolean;
  continueActiveTurn?: boolean;
}
