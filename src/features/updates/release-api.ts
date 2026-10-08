import { parseUpdateInfo, UPDATE_INFO_URL, UpdateError, type UpdateCandidate } from './model';

/** 一次请求读取 Latest 清单；尚未发布清单的 404 表示暂无可用更新，其他失败必须明确展示。 */
export async function findUpdate(fetcher: typeof fetch = fetch): Promise<UpdateCandidate | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(UPDATE_INFO_URL, { signal: controller.signal, headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
    if (response.status === 404) return null;
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) {
      const retryAfter = response.headers.get('retry-after');
      const retrySeconds = Number(retryAfter);
      const retryDate = retryAfter && !Number.isFinite(retrySeconds) ? Date.parse(retryAfter) : 0;
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
      throw new UpdateError('rateLimit', Math.max(Date.now() + 60000, Number.isFinite(retrySeconds) ? Date.now() + retrySeconds * 1000 : retryDate || 0, reset || 0));
    }
    if (!response.ok) throw new UpdateError('network');
    // 清单只有版本、APK 信息和发布说明，不接受异常大的响应。
    const text = await response.text();
    if (text.length > 32768) throw new UpdateError('invalid');
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw new UpdateError('invalid'); }
    return parseUpdateInfo(data);
  } catch (error) {
    throw error instanceof UpdateError ? error : new UpdateError('network');
  } finally { clearTimeout(timer); }
}
