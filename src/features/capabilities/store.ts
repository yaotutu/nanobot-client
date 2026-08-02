import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { fetchSkills } from '@/features/skills/api';
import type {
  CliAppInfo,
  CliAppsPayload,
  McpPresetInfo,
  McpPresetsPayload,
  SkillSummary,
} from '@/types/api/capabilities';
import type { SlashCommand } from '@/types/api/chat';

import {
  fetchInstalledCliApps,
  fetchMcpPresets,
  listSlashCommands,
} from './api';

type CapabilityResource = 'slashCommands' | 'cliApps' | 'mcpPresets' | 'skills';
type CapabilityErrors = Record<CapabilityResource, string | null>;

interface CapabilitiesState {
  slashCommands: SlashCommand[];
  cliApps: CliAppInfo[];
  cliAppsPayload: CliAppsPayload | null;
  mcpPresets: McpPresetInfo[];
  mcpPresetsPayload: McpPresetsPayload | null;
  skills: SkillSummary[];
  loading: boolean;
  errors: CapabilityErrors;
}

interface CapabilitiesActions {
  refreshAll(): Promise<void>;
  applyCliAppsPayload(payload: CliAppsPayload): void;
  applyMcpPresetsPayload(payload: McpPresetsPayload): void;
  setSkills(skills: SkillSummary[]): void;
  resetAll(): void;
}

export type CapabilitiesStore = CapabilitiesState & CapabilitiesActions;

const EMPTY_ERRORS: CapabilityErrors = {
  slashCommands: null,
  cliApps: null,
  mcpPresets: null,
  skills: null,
};

function rejectionMessage(result: PromiseSettledResult<unknown>): string | null {
  if (result.status === 'fulfilled') return null;
  return result.reason instanceof Error ? result.reason.message : String(result.reason);
}

export const useCapabilitiesStore = create<CapabilitiesStore>()(
  subscribeWithSelector((set) => ({
    slashCommands: [],
    cliApps: [],
    cliAppsPayload: null,
    mcpPresets: [],
    mcpPresetsPayload: null,
    skills: [],
    loading: false,
    errors: { ...EMPTY_ERRORS },

    async refreshAll() {
      set({ loading: true });
      const [slash, cli, mcp, skills] = await Promise.allSettled([
        listSlashCommands(),
        fetchInstalledCliApps(),
        fetchMcpPresets(),
        fetchSkills(),
      ]);
      set((state) => ({
        slashCommands: slash.status === 'fulfilled' ? slash.value : state.slashCommands,
        cliApps: cli.status === 'fulfilled'
          ? cli.value.apps.filter((app) => app.installed)
          : state.cliApps,
        cliAppsPayload: cli.status === 'fulfilled' ? cli.value : state.cliAppsPayload,
        mcpPresets: mcp.status === 'fulfilled'
          ? mcp.value.presets.filter((preset) => preset.installed && preset.configured)
          : state.mcpPresets,
        mcpPresetsPayload: mcp.status === 'fulfilled' ? mcp.value : state.mcpPresetsPayload,
        skills: skills.status === 'fulfilled' ? skills.value.skills : state.skills,
        loading: false,
        errors: {
          slashCommands: rejectionMessage(slash),
          cliApps: rejectionMessage(cli),
          mcpPresets: rejectionMessage(mcp),
          skills: rejectionMessage(skills),
        },
      }));
    },

    applyCliAppsPayload(payload) {
      set((state) => ({
        cliApps: payload.apps.filter((app) => app.installed),
        cliAppsPayload: payload,
        errors: { ...state.errors, cliApps: null },
      }));
    },

    applyMcpPresetsPayload(payload) {
      set((state) => ({
        mcpPresets: payload.presets.filter((preset) => preset.installed && preset.configured),
        mcpPresetsPayload: payload,
        errors: { ...state.errors, mcpPresets: null },
      }));
    },

    setSkills(skills) {
      set((state) => ({
        skills,
        errors: { ...state.errors, skills: null },
      }));
    },

    resetAll() {
      set({
        slashCommands: [],
        cliApps: [],
        cliAppsPayload: null,
        mcpPresets: [],
        mcpPresetsPayload: null,
        skills: [],
        loading: false,
        errors: { ...EMPTY_ERRORS },
      });
    },
  })),
);

export const selectCliApps = (s: CapabilitiesStore) => s.cliApps;
export const selectCliAppsPayload = (s: CapabilitiesStore) => s.cliAppsPayload;
export const selectMcpPresets = (s: CapabilitiesStore) => s.mcpPresets;
export const selectMcpPresetsPayload = (s: CapabilitiesStore) => s.mcpPresetsPayload;
export const selectSkills = (s: CapabilitiesStore) => s.skills;
export const selectSlashCommands = (s: CapabilitiesStore) => s.slashCommands;
