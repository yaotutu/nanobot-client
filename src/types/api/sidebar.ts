import type { WorkspaceScopePayload } from './workspaces';

export interface ChatSummary {
  key: string;
  channel: string;
  chatId: string;
  createdAt: string | null;
  updatedAt: string | null;
  title?: string;
  preview: string;
  modelPreset?: string | null;
  runStartedAt?: number | null;
  workspaceScope?: WorkspaceScopePayload | null;
}

export type SidebarDensity = "comfortable" | "compact";
export type SidebarSortMode = "updated_desc" | "created_desc" | "title_asc";

export interface SidebarStatePayload {
  schema_version: number;
  pinned_keys: string[];
  archived_keys: string[];
  title_overrides: Record<string, string>;
  project_name_overrides: Record<string, string>;
  tags_by_key: Record<string, string[]>;
  collapsed_groups: Record<string, boolean>;
  view: {
    density: SidebarDensity;
    show_previews: boolean;
    show_timestamps: boolean;
    show_archived: boolean;
    sort: SidebarSortMode;
  };
  updated_at?: string | null;
}

