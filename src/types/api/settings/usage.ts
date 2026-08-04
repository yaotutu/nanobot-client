export interface UsageDayInfo {
  date: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  provider_tokens?: number;
  estimated_tokens?: number;
  requests: number;
  provider_requests?: number;
  estimated_requests?: number;
  sources?: Record<string, {
    prompt_tokens: number;
    completion_tokens: number;
    cached_tokens: number;
    total_tokens: number;
    provider_tokens?: number;
    estimated_tokens?: number;
    requests: number;
    provider_requests?: number;
    estimated_requests?: number;
  }>;
}
