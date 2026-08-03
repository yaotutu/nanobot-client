import { apiClient } from '@/services/api/api';
import type { PairingPayload } from '@/types/api/channels';

export async function fetchPairingRequests(): Promise<PairingPayload> {
  return apiClient.get<PairingPayload>('/api/settings/pairing');
}

export async function runPairingAction(
  action: 'approve' | 'deny',
  code: string,
): Promise<PairingPayload> {
  return apiClient.get<PairingPayload>(`/api/settings/pairing/${action}`, { code });
}
