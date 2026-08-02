export type ConnectionStatus =
  "idle" | "connecting" | "open" | "reconnecting" | "closed" | "error";

export type RuntimeSurface = "browser" | "native";

export interface RuntimeCapabilities {
  can_restart_engine: boolean;
  can_pick_folder: boolean;
  can_open_logs: boolean;
  can_export_diagnostics: boolean;
}

export interface WebUIIngressLimits {
  transport: {
    max_frame_bytes: number;
    envelope_reserve_bytes: number;
  };
  message: {
    max_text_bytes: number;
  };
  attachments: {
    max_count: number;
    max_file_bytes: number;
    max_total_bytes: number;
  };
}

export interface GoalStateWsPayload {
  active: boolean;
  ui_summary?: string;
  objective?: string;
}

export interface BootstrapResponse {
  token: string;
  api_token: string;
  ws_path: string;
  ws_url?: string | null;
  expires_in: number;
  limits?: WebUIIngressLimits;
  model_name?: string | null;
  runtime_surface?: RuntimeSurface;
  runtime_capabilities?: RuntimeCapabilities;
}

