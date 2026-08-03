export type StreamError =
  | { kind: 'message_too_big'; chatId?: string; turnId?: string }
  | {
      kind: 'workspace_scope_rejected';
      reason?: string;
      chatId?: string;
      turnId?: string;
    }
  | {
      kind: 'turn_rejected';
      detail?: string;
      reason?: string;
      chatId: string;
      turnId: string;
    };
