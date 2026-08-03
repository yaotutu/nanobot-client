import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchInstalledCliApps,
  fetchMcpPresets,
  listSlashCommands,
} from '@/features/capabilities/api';
import { useCapabilitiesStore } from '@/features/capabilities/store';
import type {
  CliAppInfo,
  CliAppsPayload,
  McpPresetInfo,
  McpPresetsPayload,
} from '@/types/api/capabilities';
import type { SlashCommand } from '@/types/api/chat';

vi.mock('@/features/capabilities/api', () => ({
  fetchInstalledCliApps: vi.fn(),
  fetchMcpPresets: vi.fn(),
  listSlashCommands: vi.fn(),
}));


const slashCommand: SlashCommand = {
  command: '/help',
  title: 'Help',
  description: 'Show help',
  icon: 'help-circle',
  argHint: '',
  lifecycle: 'side_channel',
  acceptsArgs: false,
};

function cliApp(name: string, installed: boolean): CliAppInfo {
  return {
    name,
    display_name: name,
    category: 'tools',
    description: `${name} description`,
    requires: '',
    source: 'catalog',
    entry_point: name,
    install_supported: true,
    installed,
    available: installed,
    status: installed ? 'ready' : 'available',
    skill_installed: false,
  };
}

function mcpPreset(name: string, installed: boolean, configured: boolean): McpPresetInfo {
  return {
    name,
    display_name: name,
    category: 'tools',
    description: `${name} description`,
    docs_url: '',
    transport: 'stdio',
    requires: '',
    note: '',
    install_supported: true,
    installed,
    configured,
    available: installed && configured,
    status: installed && configured ? 'ready' : 'available',
    required_fields: [],
    connection_summary: '',
  };
}

const cliPayload: CliAppsPayload = {
  apps: [cliApp('installed-cli', true), cliApp('catalog-cli', false)],
  installed_count: 1,
};

const mcpPayload: McpPresetsPayload = {
  presets: [mcpPreset('ready-mcp', true, true), mcpPreset('setup-mcp', true, false)],
  installed_count: 1,
};

function mockSuccessfulRefresh() {
  vi.mocked(listSlashCommands).mockResolvedValue([slashCommand]);
  vi.mocked(fetchInstalledCliApps).mockResolvedValue(cliPayload);
  vi.mocked(fetchMcpPresets).mockResolvedValue(mcpPayload);
}

describe('useCapabilitiesStore', () => {
  beforeEach(() => {
    vi.mocked(listSlashCommands).mockReset();
    vi.mocked(fetchInstalledCliApps).mockReset();
    vi.mocked(fetchMcpPresets).mockReset();
    useCapabilitiesStore.getState().resetAll();
  });

  it('stores catalog payloads and their chat-ready projections', async () => {
    mockSuccessfulRefresh();

    await useCapabilitiesStore.getState().refreshAll();

    expect(useCapabilitiesStore.getState()).toMatchObject({
      slashCommands: [slashCommand],
      cliApps: [cliPayload.apps[0]],
      cliAppsPayload: cliPayload,
      mcpPresets: [mcpPayload.presets[0]],
      mcpPresetsPayload: mcpPayload,
      loading: false,
      errors: {
        slashCommands: null,
        cliApps: null,
        mcpPresets: null,
      },
    });
  });

  it('preserves the last successful resource when one refresh fails', async () => {
    mockSuccessfulRefresh();
    await useCapabilitiesStore.getState().refreshAll();

    vi.mocked(listSlashCommands).mockResolvedValue([{ ...slashCommand, command: '/new' }]);
    vi.mocked(fetchInstalledCliApps).mockRejectedValue(new Error('CLI catalog unavailable'));
    vi.mocked(fetchMcpPresets).mockResolvedValue({ presets: [], installed_count: 0 });

    await useCapabilitiesStore.getState().refreshAll();

    expect(useCapabilitiesStore.getState()).toMatchObject({
      slashCommands: [{ ...slashCommand, command: '/new' }],
      cliApps: [cliPayload.apps[0]],
      cliAppsPayload: cliPayload,
      mcpPresets: [],
      mcpPresetsPayload: { presets: [], installed_count: 0 },
      errors: {
        slashCommands: null,
        cliApps: 'CLI catalog unavailable',
        mcpPresets: null,
      },
    });
  });

  it('deduplicates overlapping catalog refreshes', async () => {
    let resolveSlash!: (value: SlashCommand[]) => void;
    let resolveCli!: (value: CliAppsPayload) => void;
    let resolveMcp!: (value: McpPresetsPayload) => void;
    vi.mocked(listSlashCommands).mockReturnValue(new Promise((resolve) => {
      resolveSlash = resolve;
    }));
    vi.mocked(fetchInstalledCliApps).mockReturnValue(new Promise((resolve) => {
      resolveCli = resolve;
    }));
    vi.mocked(fetchMcpPresets).mockReturnValue(new Promise((resolve) => {
      resolveMcp = resolve;
    }));

    const first = useCapabilitiesStore.getState().refreshAll();
    const second = useCapabilitiesStore.getState().refreshAll();
    resolveSlash([slashCommand]);
    resolveCli(cliPayload);
    resolveMcp(mcpPayload);
    await Promise.all([first, second]);

    expect(listSlashCommands).toHaveBeenCalledTimes(1);
    expect(fetchInstalledCliApps).toHaveBeenCalledTimes(1);
    expect(fetchMcpPresets).toHaveBeenCalledTimes(1);
  });

  it('updates the canonical payload and projection together after a mutation', () => {
    const updated: CliAppsPayload = {
      apps: [cliApp('new-cli', true), cliApp('old-cli', false)],
      installed_count: 1,
    };

    useCapabilitiesStore.getState().applyCliAppsPayload(updated);

    expect(useCapabilitiesStore.getState().cliAppsPayload).toBe(updated);
    expect(useCapabilitiesStore.getState().cliApps).toEqual([updated.apps[0]]);
  });
});
