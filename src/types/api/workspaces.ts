export type WebuiDefaultAccessMode = "default" | "full";
export type WorkspaceAccessMode = "restricted" | "full";

export interface WorkspaceSandboxStatus {
  restrict_to_workspace: boolean;
  workspace_root: string;
  level: string;
  enforced: boolean;
  provider: string;
  provider_label: string;
  summary: string;
}

export interface WorkspaceScopePayload {
  project_path: string;
  project_name?: string;
  access_mode: WorkspaceAccessMode;
  restrict_to_workspace?: boolean;
  sandbox_status?: WorkspaceSandboxStatus;
}

export interface WorkspacesPayload {
  schema_version: number;
  default_access_mode: WebuiDefaultAccessMode;
  default_scope: WorkspaceScopePayload;
  controls: {
    can_change_project: boolean;
    can_use_full_access: boolean;
  };
}

