export interface ModelPresetInfo {
  name: string;
  label: string;
  active: boolean;
  is_default: boolean;
  model: string;
  provider: string;
  resolved_provider?: string | null;
  max_tokens: number;
  context_window_tokens: number;
  temperature: number;
  reasoning_effort: string | null;
  reasoning_effort_values?: string[];
}

/** 服务端仍返回 /api/settings；客户端仅保留聊天需要的只读投影。 */
export interface ChatModelCatalog {
  agent: { model_preset: string | null };
  model_presets: ModelPresetInfo[];
  model_call_order: string[];
}
