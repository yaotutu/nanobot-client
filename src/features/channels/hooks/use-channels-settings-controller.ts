import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useChannelsCatalog } from '@/features/channels/hooks/use-channels-catalog';
import {
  type ChannelFilter,
  channelCopy,
  channelRunning,
} from '@/features/channels/model';
import { featureSearchText } from '@/features/channels/presentation/channel-search';
import { setNanobotFeatureEnabled } from '@/services/api/nanobot-features';
import { currentLocale } from '@/i18n';
import type { NanobotFeatureInfo } from '@/types/api/nanobot-features';

export function useChannelsSettingsController() {
  const { t } = useTranslation();
  const catalog = useChannelsCatalog();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const actionKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const beginAction = (key: string): boolean => {
    if (!mountedRef.current || actionKeyRef.current) return false;
    actionKeyRef.current = key;
    setActionKey(key);
    return true;
  };

  const endAction = (key: string) => {
    if (actionKeyRef.current !== key) return;
    actionKeyRef.current = null;
    if (mountedRef.current) setActionKey(null);
  };

  const allChannels = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(currentLocale());
    return (catalog.payload?.features ?? [])
      .filter((feature) => feature.type === 'channel' && feature.settings_visible !== false)
      .filter((feature) => !needle || featureSearchText(feature, t).includes(needle))
      .sort((left, right) => (
        Number(!left.ready) - Number(!right.ready)
        || (left.display_name || left.name).localeCompare(right.display_name || right.name)
      ));
  }, [catalog.payload, query, t]);
  const enabledCount = allChannels.filter(channelRunning).length;
  const channels = allChannels.filter((feature) => (
    filter === 'all'
    || (filter === 'on' ? channelRunning(feature) : !channelRunning(feature))
  ));
  const selectedFeature = (catalog.payload?.features ?? [])
    .find((feature) => feature.name === selected) ?? null;

  const toggle = async (
    feature: NanobotFeatureInfo,
    enabled: boolean,
    instanceId?: string,
  ) => {
    const key = `${enabled ? 'enable' : 'disable'}:${feature.name}:${instanceId ?? 'default'}`;
    if (!beginAction(key)) return;
    catalog.setError(null);
    try {
      const next = await setNanobotFeatureEnabled(
        enabled ? 'enable' : 'disable',
        feature.name,
        instanceId,
      );
      if (!mountedRef.current) return;
      catalog.applyPayload(next);
      catalog.setError(next.last_action?.ok === false ? next.last_action.message : null);
    } catch (caught) {
      if (!mountedRef.current) return;
      catalog.setError(caught instanceof Error
        ? caught.message
        : channelCopy(t, 'actionFailed', 'Channel action failed.'));
    } finally {
      endAction(key);
    }
  };

  return {
    ...catalog,
    actionKey,
    channels,
    enabledCount,
    filter,
    query,
    selectedFeature,
    setFilter,
    setQuery,
    setSelected,
    toggle,
    totalCount: allChannels.length,
  };
}
