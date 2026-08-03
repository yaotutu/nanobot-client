import { describe, expect, it } from 'vitest';

import {
  channelInstances,
  channelRunning,
  channelToggleChecked,
  defaultValues,
  instanceDisplayName,
  resolveSelectedInstanceId,
} from '@/features/channels/model';
import type {
  NanobotChannelInstanceInfo,
  NanobotFeatureInfo,
} from '@/types/api/nanobot-features';

const feature = (overrides: Partial<NanobotFeatureInfo> = {}): NanobotFeatureInfo => ({
  name: 'discord',
  display_name: 'Discord',
  type: 'channel',
  enabled: false,
  installed: true,
  ready: true,
  status: 'not_enabled',
  install_supported: true,
  requires_restart: false,
  ...overrides,
});

const instance = (
  id: string,
  overrides: Partial<NanobotChannelInstanceInfo> = {},
): NanobotChannelInstanceInfo => ({
  id,
  name: id,
  enabled: false,
  configured: false,
  config_values: {},
  configured_fields: [],
  ...overrides,
});

describe('channel model', () => {
  it('derives runtime and toggle state from authoritative status', () => {
    expect(channelRunning(feature({ runtime_status: 'running' }))).toBe(true);
    expect(channelToggleChecked(feature({ runtime_status: 'starting' }))).toBe(true);
    expect(channelToggleChecked(feature({ capabilities: ['always_enabled'] }))).toBe(true);
  });

  it('builds field defaults in precedence order', () => {
    expect(defaultValues([
      { key: 'explicit', label: 'Explicit', defaultValue: 'fallback' },
      { key: 'default', label: 'Default', defaultValue: 'fallback' },
      { key: 'choice', label: 'Choice', options: [{ value: 'first', label: 'First' }] },
      { key: 'empty', label: 'Empty' },
    ], { explicit: 'saved' })).toEqual({
      explicit: 'saved',
      default: 'fallback',
      choice: 'first',
      empty: '',
    });
  });

  it('creates the Feishu fallback instance from feature state', () => {
    expect(channelInstances(feature({
      name: 'feishu',
      enabled: true,
      running: true,
      configured: true,
      config_values: { appId: 'one' },
    }))).toEqual([expect.objectContaining({
      id: 'default',
      name: 'nanobot',
      enabled: true,
      running: true,
      configured: true,
    })]);
  });

  it('keeps a valid selected instance and falls back when it disappears', () => {
    const instances = [instance('first'), instance('second')];
    expect(resolveSelectedInstanceId(instances, 'second')).toBe('second');
    expect(resolveSelectedInstanceId(instances, 'missing')).toBe('first');
  });

  it('uses display name, then name, then id for instance labels', () => {
    expect(instanceDisplayName(instance('id', { display_name: ' Display ' }))).toBe('Display');
    expect(instanceDisplayName(instance('id', { name: ' Name ' }))).toBe('Name');
    expect(instanceDisplayName(instance('id', { name: ' ' }))).toBe('id');
  });
});
