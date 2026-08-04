import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { BootstrapResponseError } from '@/features/auth/api';
import {
  bootstrapSessionManager,
  isBootstrapAbortError,
} from '@/features/auth/bootstrap-session-manager';
import { clearBootstrapSecret, saveBootstrapSecret } from '@/services/credentials/auth-credentials';
import { debugLog } from '@/services/runtime/debug-log';
import { setApiTokenProvider } from '@/services/api/api';
import i18n from '@/i18n';
import type { BootstrapResponse } from '@/types/api/runtime';

export type AuthPhase = 'booting' | 'authentication' | 'ready' | 'unreachable';

interface AuthState {
  phase: AuthPhase;
  bootstrap: BootstrapResponse | null;
  /** 仅用于内存（避免 token 出现在状态树序列化中），apiClient 通过 getToken() 动态读 */
  apiToken: string | null;
  authenticationFailed: boolean;
  error: string | null;
  /** 登录身份代次；token 静默续期不会改变它。 */
  sessionEpoch: number;
  /** 每次成功签发新 token 后递增。 */
  tokenGeneration: number;
  /** 内部：是否已经尝试过自动 bootstrap（避免 StrictMode 下重复跑） */
  _bootstrapped: boolean;
}

interface AuthActions {
  bootstrapFromStorage(): Promise<void>;
  authenticate(secret: string): Promise<void>;
  refreshBootstrap(reason?: import('./bootstrap-session-manager').BootstrapRefreshReason): Promise<BootstrapResponse>;
  logout(): Promise<void>;
  retryConnection(): Promise<void>;
  clearError(): void;
}

export type AuthStore = AuthState & AuthActions;

let refreshBootstrapTask: Promise<BootstrapResponse> | null = null;

function errorMessage(caught: unknown): string {
  if (caught instanceof BootstrapResponseError) {
    return caught.code === 'gateway_html_response'
      ? i18n.t('app.error.gatewayHtmlResponse')
      : i18n.t('app.error.nonJsonResponse');
  }
  return caught instanceof Error ? caught.message : i18n.t('app.error.title');
}

function isAuthenticationError(caught: unknown): boolean {
  return (caught as { name?: string }).name === 'BootstrapAuthRequiredError';
}

export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set, get) => ({
    phase: 'booting',
    bootstrap: null,
    apiToken: null,
    authenticationFailed: false,
    error: null,
    sessionEpoch: 0,
    tokenGeneration: 0,
    _bootstrapped: false,

    async bootstrapFromStorage() {
      if (get()._bootstrapped) return;
      try {
        const payload = await bootstrapSessionManager.refresh('app-start');
        if (get()._bootstrapped) return;
        set((state) => ({
          bootstrap: payload,
          apiToken: payload.api_token,
          authenticationFailed: false,
          error: null,
          phase: 'ready',
          sessionEpoch: state.sessionEpoch + 1,
          tokenGeneration: state.tokenGeneration + 1,
          _bootstrapped: true,
        }));
      } catch (caught) {
        if (isBootstrapAbortError(caught)) return;
        const message = errorMessage(caught);
        debugLog('AUTH', `bootstrap failed: ${message}`);
        if (caught instanceof Error && caught.message === 'no bootstrap secret') {
          set({ phase: 'authentication', _bootstrapped: true });
          return;
        }
        if (isAuthenticationError(caught)) {
          await clearBootstrapSecret();
          set({ phase: 'authentication', _bootstrapped: true });
          return;
        }
        set({ phase: 'unreachable', error: message, _bootstrapped: true });
      }
    },

    async authenticate(secret: string) {
      set({ phase: 'booting', error: null });
      try {
        const payload = await bootstrapSessionManager.authenticate(secret);
        await saveBootstrapSecret(secret);
        set((state) => ({
          bootstrap: payload,
          apiToken: payload.api_token,
          authenticationFailed: false,
          error: null,
          phase: 'ready',
          sessionEpoch: state.sessionEpoch + 1,
          tokenGeneration: state.tokenGeneration + 1,
        }));
      } catch (caught) {
        if (isBootstrapAbortError(caught)) return;
        if (isAuthenticationError(caught)) {
          set({ authenticationFailed: true, phase: 'authentication' });
          return;
        }
        set({ error: errorMessage(caught), phase: 'unreachable' });
      }
    },

    refreshBootstrap(reason = 'scheduled-renewal') {
      if (refreshBootstrapTask) return refreshBootstrapTask;
      const task = bootstrapSessionManager.refresh(reason).then((payload) => {
        set((state) => ({
          bootstrap: payload,
          apiToken: payload.api_token,
          error: null,
          phase: 'ready',
          tokenGeneration: state.tokenGeneration + 1,
        }));
        return payload;
      });
      refreshBootstrapTask = task.finally(() => {
        refreshBootstrapTask = null;
      });
      return refreshBootstrapTask;
    },

    async logout() {
      bootstrapSessionManager.cancel();
      refreshBootstrapTask = null;
      await clearBootstrapSecret();
      set({
        bootstrap: null,
        apiToken: null,
        authenticationFailed: false,
        error: null,
        phase: 'authentication',
        sessionEpoch: 0,
        tokenGeneration: 0,
        _bootstrapped: true,
      });
    },

    async retryConnection() {
      set({ phase: 'booting', error: null });
      try {
        const payload = await bootstrapSessionManager.refresh('manual-retry');
        set((state) => ({
          bootstrap: payload,
          apiToken: payload.api_token,
          authenticationFailed: false,
          phase: 'ready',
          sessionEpoch: state.bootstrap ? state.sessionEpoch : state.sessionEpoch + 1,
          tokenGeneration: state.tokenGeneration + 1,
        }));
      } catch (caught) {
        if (isBootstrapAbortError(caught)) return;
        if (caught instanceof Error && caught.message === 'no bootstrap secret') {
          set({ phase: 'authentication' });
          return;
        }
        set({ error: errorMessage(caught), phase: 'unreachable' });
      }
    },

    clearError() {
      set({ error: null });
    },
  })),
);

setApiTokenProvider(() => useAuthStore.getState().apiToken ?? '');

export const selectAuthPhase = (s: AuthStore) => s.phase;
export const selectBootstrap = (s: AuthStore) => s.bootstrap;
export const selectAuthSessionEpoch = (s: AuthStore) => s.sessionEpoch;
export const selectTokenGeneration = (s: AuthStore) => s.tokenGeneration;
