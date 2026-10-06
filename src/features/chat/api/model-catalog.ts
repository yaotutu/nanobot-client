import { apiClient } from '@/services/api/api';
import type { RequestOptions } from '@/services/api/api-client';
import type { ChatModelCatalog } from '@/types/api/chat/models';

/** 聊天只读取模型与运行默认值；不暴露服务端配置写入能力。 */
export async function fetchChatModelCatalog(options?: Pick<RequestOptions, 'signal'>): Promise<ChatModelCatalog> {
  const payload = await apiClient.get<ChatModelCatalog>('/api/settings', undefined, options);
  // 不将 provider、密钥提示、媒体生成配置等无关服务端设置存入聊天状态。
  return {
    agent: { model_preset: payload.agent.model_preset },
    model_presets: payload.model_presets,
    model_call_order: payload.model_call_order,
  };
}
