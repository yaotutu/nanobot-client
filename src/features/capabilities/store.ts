import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import type {
  CliAppInfo,
  CliAppsPayload,
  McpPresetInfo,
  McpPresetsPayload,
  SkillSummary,
  SlashCommand,
} from '@/types/api';

import {
  fetchInstalledCliApps,
  fetchMcpPresets,
  fetchSkills,
  listSlashCommands,
} from './api';

interface CapabilitiesState {
  slashCommands: SlashCommand[];
  cliApps: CliAppInfo[];
  mcpPresets: McpPresetInfo[];
  skills: SkillSummary[];
  loading: boolean;
}

interface CapabilitiesActions {
  refreshAll(): Promise<void>;
  applyCliAppsPayload(payload: CliAppsPayload): void;
  applyMcpPresetsPayload(payload: McpPresetsPayload): void;
  setSkills(skills: SkillSummary[]): void;
  resetAll(): void;
}

export type CapabilitiesStore = CapabilitiesState & CapabilitiesActions;

export const useCapabilitiesStore = create<CapabilitiesStore>()(
  subscribeWithSelector((set) => ({
    slashCommands: [],
    cliApps: [],
    mcpPresets: [],
    skills: [],
    loading: false,

    async refreshAll() {
      set({ loading: true });
      try {
        const [slash, cli, mcp, skills] = await Promise.allSettled([
          listSlashCommands(),
          fetchInstalledCliApps(),
          fetchMcpPresets(),
          fetchSkills(),
        ]);
        set({
          slashCommands: slash.status === 'fulfilled' ? slash.value : [],
          cliApps: cli.status === 'fulfilled' ? cli.value.apps.filter((a) => a.installed) : [],
          mcpPresets:
            mcp.status === 'fulfilled'
              ? mcp.value.presets.filter((p) => p.installed && p.configured)
              : [],
          skills: skills.status === 'fulfilled' ? skills.value.skills : [],
          loading: false,
        });
      } catch {
        set({ loading: false });
      }
    },

    applyCliAppsPayload(payload) {
      set({ cliApps: payload.apps.filter((a) => a.installed) });
    },

    applyMcpPresetsPayload(payload) {
      set({ mcpPresets: payload.presets.filter((p) => p.installed && p.configured) });
    },

    setSkills(skills) {
      set({ skills });
    },

    resetAll() {
      set({ slashCommands: [], cliApps: [], mcpPresets: [], skills: [], loading: false });
    },
  })),
);

export const selectCliApps = (s: CapabilitiesStore) => s.cliApps;
export const selectMcpPresets = (s: CapabilitiesStore) => s.mcpPresets;
export const selectSkills = (s: CapabilitiesStore) => s.skills;
export const selectSlashCommands = (s: CapabilitiesStore) => s.slashCommands;
