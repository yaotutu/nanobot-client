/**
 * UI-派生类型 / 业务领域类型。
 * wire-format 类型见 `@/types/api`（原 `types/nanobot.ts`）。
 */

export type AppTheme = 'light' | 'dark';
export type AppLanguage = string;
export type LocalDensity = 'comfortable' | 'compact';
export type LocalActivityMode = 'auto' | 'expanded';
export type FileEditDisplayMode = 'summary' | 'diff' | 'collapsed_diff';

export type { BootstrapResponse, InboundEvent } from './api';
