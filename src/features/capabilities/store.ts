import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type {
  CliAppInfo,
  McpPresetInfo,
} from '@/types/api/capabilities';
import type { SlashCommand } from '@/types/api/chat/commands';

import {
  fetchInstalledCliApps,
  fetchMcpPresets,
  listSlashCommands,
} from './api';

type CapabilityResource = 'slashCommands' | 'cliApps' | 'mcpPresets';
type CapabilityErrors = Record<CapabilityResource, string | null>;

interface CapabilitiesState {
  slashCommands: SlashCommand[];
  cliApps: CliAppInfo[];
  mcpPresets: McpPresetInfo[];
  loading: boolean;
  errors: CapabilityErrors;
}

interface CapabilitiesActions {
  refreshAll(): Promise<void>;
  resetAll(): void;
}

export type CapabilitiesStore = CapabilitiesState & CapabilitiesActions;

const EMPTY_ERRORS: CapabilityErrors = {
  slashCommands: null,
  cliApps: null,
  mcpPresets: null,
};

function rejectionMessage(result: PromiseSettledResult<unknown>): string | null {
  if (result.status === 'fulfilled') return null;
  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}

let refreshPromise: Promise<void> | null = null;
let refreshSequence = 0;
let activeRefreshId: number | null = null;
let generation = 0;

export const useCapabilitiesStore = create<CapabilitiesStore>()(
  subscribeWithSelector((set) => ({
    slashCommands: [],
    cliApps: [],
    mcpPresets: [],
    loading: false,
    errors: { ...EMPTY_ERRORS },

    async refreshAll() {
      if (refreshPromise) return refreshPromise;
      const requestGeneration = generation;
      const refreshId = ++refreshSequence;
      activeRefreshId = refreshId;
      set({ loading: true });
      const request = (async () => {
        const [slash, cli, mcp] = await Promise.allSettled([
          listSlashCommands(),
          fetchInstalledCliApps(),
          fetchMcpPresets(),
        ]);
        if (requestGeneration !== generation) return;
        set((state) => ({
          slashCommands: slash.status === 'fulfilled' ? slash.value : state.slashCommands,
          cliApps: cli.status === 'fulfilled'
            ? cli.value.apps.filter((app) => app.installed)
            : state.cliApps,
          mcpPresets: mcp.status === 'fulfilled'
            ? mcp.value.presets.filter((preset) => preset.installed && preset.configured)
            : state.mcpPresets,
          loading: false,
          errors: {
            slashCommands: rejectionMessage(slash),
            cliApps: rejectionMessage(cli),
            mcpPresets: rejectionMessage(mcp),
          },
        }));
      })().finally(() => {
        if (activeRefreshId === refreshId) {
          activeRefreshId = null;
          refreshPromise = null;
        }
      });
      refreshPromise = request;
      return request;
    },

    resetAll() {
      generation += 1;
      activeRefreshId = null;
      refreshPromise = null;
      set({
        slashCommands: [],
        cliApps: [],
        mcpPresets: [],
        loading: false,
        errors: { ...EMPTY_ERRORS },
      });
    },
  })),
);
