import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchChatModelCatalog } from '@/features/chat/api/model-catalog';
import { apiClient } from '@/services/api/api';

vi.mock('@/services/api/api', () => ({ apiClient: { get: vi.fn() } }));

describe('聊天只读模型目录', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset());

  it('只保留聊天需要的字段，并传递中止信号', async () => {
    const signal = new AbortController().signal;
    const presets = [{ name: 'default', label: '默认模型' }];
    vi.mocked(apiClient.get).mockResolvedValue({
      agent: { model_preset: 'default', timezone: 'Asia/Shanghai' },
      model_presets: presets,
      model_call_order: ['default'],
      providers: [{ api_key_hint: 'should-not-be-stored' }],
      transcription: { enabled: true },
    });
    const catalog = await fetchChatModelCatalog({ signal });
    expect(apiClient.get).toHaveBeenCalledExactlyOnceWith('/api/settings', undefined, { signal });
    expect(catalog).toEqual({
      agent: { model_preset: 'default' }, model_presets: presets, model_call_order: ['default'],
    });
  });
});
