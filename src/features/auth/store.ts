import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type { BootstrapResponse } from '@/types/api';
import { fetchBootstrap } from './api';
import {
  clearBootstrapSecret,
  loadBootstrapSecret,
  saveBootstrapSecret,
} from '@/services/credentials/auth-credentials';
import { loadLocalDevBootstrapSecret } from '@/services/credentials/local-dev-bootstrap';
import { debugLog } from '@/services/runtime/debug-log';
import i18n from '@/i18n';

export type AuthPhase = 'booting' | 'authentication' | 'ready' | 'unreachable';

interface AuthState {
  phase: AuthPhase;
  bootstrap: BootstrapResponse | null;
  /** 仅用于内存（避免 token 出现在状态树序列化中），apiClient 通过 getToken() 动态读 */
  apiToken: string | null;
  authenticationFailed: boolean;
  error: string | null;

  /** 内部：是否已经尝试过自动 bootstrap（避免 StrictMode 下重复跑） */
  _bootstrapped: boolean;
}

interface AuthActions {
  /** 应用启动时调用：从 SecureStore 读取已保存的 secret，必要时自动 bootstrap */
  bootstrapFromStorage(): Promise<void>;
  /** 用户输入 secret 后调用 */
  authenticate(secret: string): Promise<void>;
  /** 已 bootstrap 后静默刷新 token */
  refreshBootstrap(): Promise<void>;
  /** 退出登录 */
  logout(): Promise<void>;
  /** 重连入口（unreachable phase 后） */
  retryConnection(): Promise<void>;
  /** 清除 error */
  clearError(): void;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set, get) => ({
    phase: 'booting',
    bootstrap: null,
    apiToken: null,
    authenticationFailed: false,
    error: null,
    _bootstrapped: false,

    async bootstrapFromStorage() {
      if (get()._bootstrapped) return;
      const savedSecret = await loadBootstrapSecret();
      const localDevSecret = loadLocalDevBootstrapSecret();
      const secret = savedSecret || localDevSecret;
      debugLog('AUTH', `savedSecret=${savedSecret ? 'yes' : 'no'}`);
      if (!secret) {
        set({ phase: 'authentication', _bootstrapped: true });
        return;
      }
      try {
        await get().refreshBootstrap();
        set({ _bootstrapped: true });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : i18n.t('app.error.title');
        debugLog('AUTH', `bootstrap failed: ${message}`);
        const authError = (caught as { name?: string }).name === 'BootstrapAuthRequiredError';
        if (authError) {
          await clearBootstrapSecret();
          set({ phase: 'authentication', _bootstrapped: true });
          return;
        }
        set({ phase: 'unreachable', error: message, _bootstrapped: true });
      }
    },

    async authenticate(secret: string) {
      set({ phase: 'booting' });
      try {
        const payload = await fetchBootstrap(secret);
        await saveBootstrapSecret(secret);
        set({
          bootstrap: payload,
          apiToken: payload.api_token,
          authenticationFailed: false,
          error: null,
          phase: 'ready',
        });
      } catch (caught) {
        const authError = (caught as { name?: string }).name === 'BootstrapAuthRequiredError';
        if (authError) {
          set({ authenticationFailed: true, phase: 'authentication' });
          return;
        }
        const message = caught instanceof Error ? caught.message : i18n.t('app.error.title');
        set({ error: message, phase: 'unreachable' });
      }
    },

    async refreshBootstrap() {
      // 仅在已认证状态下使用：bootstrap() 之后由 store 调用，或由 socket bridge 续期时调用。
      const current = get().bootstrap;
      const apiToken = get().apiToken;
      if (!current) {
        // 首次自动 bootstrap：从 SecureStore 读取后调 fetchBootstrap
        const savedSecret = await loadBootstrapSecret();
        const localDevSecret = loadLocalDevBootstrapSecret();
        const secret = savedSecret || localDevSecret;
        if (!secret) throw new Error('no secret');
        const payload = await fetchBootstrap(secret);
        set({
          bootstrap: payload,
          apiToken: payload.api_token,
          phase: 'ready',
        });
        return;
      }
      // 续期：拿当前 token（api_token 用于 HTTP）去 fetch
      const payload = await fetchBootstrap(apiToken ?? '');
      set({
        bootstrap: payload,
        apiToken: payload.api_token,
        error: null,
        phase: 'ready',
      });
    },

    async logout() {
      await clearBootstrapSecret();
      set({
        bootstrap: null,
        apiToken: null,
        authenticationFailed: false,
        error: null,
        phase: 'authentication',
      });
    },

    async retryConnection() {
      const savedSecret = await loadBootstrapSecret();
      const apiToken = get().apiToken;
      const secret = apiToken || savedSecret;
      if (!secret) {
        set({ phase: 'authentication' });
        return;
      }
      set({ phase: 'booting', error: null });
      try {
        const payload = await fetchBootstrap(secret);
        set({
          bootstrap: payload,
          apiToken: payload.api_token,
          phase: 'ready',
        });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : i18n.t('app.error.title');
        set({ error: message, phase: 'unreachable' });
      }
    },

    clearError() {
      set({ error: null });
    },
  })),
);

/** Selectors — 用于 `useAuthStore(selector)` 高效订阅 */
export const selectAuthPhase = (s: AuthStore) => s.phase;
export const selectBootstrap = (s: AuthStore) => s.bootstrap;
export const selectIsAuthenticated = (s: AuthStore) => s.phase === 'ready' && s.bootstrap !== null;
export const selectApiToken = (s: AuthStore) => s.apiToken;
