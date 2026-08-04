import { fetchBootstrap } from '@/features/auth/api';
import {
  loadBootstrapSecret,
} from '@/services/credentials/auth-credentials';
import { loadLocalDevBootstrapSecret } from '@/services/credentials/local-dev-bootstrap';
import type { BootstrapResponse } from '@/types/api/runtime';

export type BootstrapRefreshReason =
  | 'app-start'
  | 'manual-retry'
  | 'scheduled-renewal'
  | 'socket-reauthentication';

interface InFlightRefresh {
  controller: AbortController;
  reason: BootstrapRefreshReason;
  generation: number;
  promise: Promise<BootstrapResponse>;
}

export class BootstrapSessionManager {
  private generation = 0;
  private inFlight: InFlightRefresh | null = null;
  private authenticationController: AbortController | null = null;

  refresh(reason: BootstrapRefreshReason): Promise<BootstrapResponse> {
    if (this.inFlight) return this.inFlight.promise;

    const generation = this.generation;
    const controller = new AbortController();
    const request: InFlightRefresh = {
      controller,
      reason,
      generation,
      promise: Promise.resolve(null as never),
    };

    request.promise = this.resolveStoredSecret()
      .then((secret) => fetchBootstrap(secret, { signal: controller.signal }))
      .then((payload) => {
        if (generation !== this.generation) throw createAbortError();
        return payload;
      })
      .finally(() => {
        if (this.inFlight === request) this.inFlight = null;
      });
    this.inFlight = request;
    return request.promise;
  }

  async authenticate(secret: string): Promise<BootstrapResponse> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.authenticationController = controller;
    try {
      const payload = await fetchBootstrap(secret, { signal: controller.signal });
      if (generation !== this.generation) throw createAbortError();
      return payload;
    } finally {
      if (this.authenticationController === controller) this.authenticationController = null;
    }
  }

  cancel(): void {
    this.generation += 1;
    this.inFlight?.controller.abort();
    this.authenticationController?.abort();
    this.inFlight = null;
    this.authenticationController = null;
  }

  private async resolveStoredSecret(): Promise<string> {
    const savedSecret = await loadBootstrapSecret();
    const localDevSecret = loadLocalDevBootstrapSecret();
    const secret = savedSecret || localDevSecret;
    if (!secret) throw new Error('no bootstrap secret');
    return secret;
  }
}

function createAbortError(): Error {
  const error = new Error('bootstrap request aborted');
  error.name = 'AbortError';
  return error;
}

export function isBootstrapAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export const bootstrapSessionManager = new BootstrapSessionManager();
